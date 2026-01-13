const express = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const app = express();

app.use(express.json());
app.use(express.static('./'));

// --- ⚙️ ADMIN CONFIGURATION (Update here) ---
const CONFIG = {
    ADMIN_ID: 8260431304,
    MINING_TIME_MIN: 20,       // Time in minutes
    MINING_PROFIT: 1.0,        // Profit per session
    REFERRAL_REWARD: 2.0,      // Reward per friend
    MIN_WITHDRAW: 10.0         // Minimum to withdraw
};

// --- 📋 TASKS CONFIGURATION ---
const TASKS = [
    { id: 't1', title: 'Join Official Channel', reward: 5.0, link: 'https://t.me/your_channel' },
    { id: 't2', title: 'Follow our X account', reward: 3.0, link: 'https://x.com/your_account' }
];

// 1. Database Connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// 2. Data Models
const userSchema = new mongoose.Schema({
    user_id: String,
    username: String,
    balance: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    lastMiningStart: Date,
    isMining: { type: Boolean, default: false },
    completedTasks: { type: [String], default: [] }
});

const withdrawSchema = new mongoose.Schema({
    user_id: String,
    username: String,
    amount: Number,
    wallet: String,
    status: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Withdraw = mongoose.model('Withdraw', withdrawSchema);

// 3. Telegram Bot Logic
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || "User";
    const startPayload = ctx.startPayload;

    let user = await User.findOne({ user_id: userId });
    if (!user) {
        user = new User({ user_id: userId, username: username });
        if (startPayload && startPayload !== userId) {
            const ref = await User.findOne({ user_id: startPayload });
            if (ref) {
                ref.balance += CONFIG.REFERRAL_REWARD;
                ref.referrals += 1;
                await ref.save();
                bot.telegram.sendMessage(startPayload, `🎁 +${CONFIG.REFERRAL_REWARD} TON! New Referral.`);
            }
        }
        await user.save();
    }
    ctx.reply(`Welcome to TON Miner!\n\nMin. Withdraw: ${CONFIG.MIN_WITHDRAW} TON\nRef Reward: ${CONFIG.REFERRAL_REWARD} TON`, {
        reply_markup: { inline_keyboard: [[{ text: "⛏️ Start Mining", web_app: { url: process.env.WEBAPP_URL } }]] }
    });
});

// --- 🛠 Admin Panel ---
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID) return;
    const totalUsers = await User.countDocuments();
    const pending = await Withdraw.countDocuments({ status: 'Pending' });

    ctx.reply(`📊 ADMIN DASHBOARD\n\nUsers: ${totalUsers}\nPending Withdraws: ${pending}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "💰 Review Withdrawals", callback_data: "list_withdraws" }],
                [{ text: "📢 Broadcast to All", callback_data: "start_broadcast" }]
            ]
        }
    });
});

bot.action('list_withdraws', async (ctx) => {
    const req = await Withdraw.findOne({ status: 'Pending' });
    if (!req) return ctx.reply("No pending requests.");
    ctx.reply(`Request:\nUser: @${req.username}\nAmount: ${req.amount} TON\nWallet: ${req.wallet}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "✅ Approve", callback_data: `withdraw_approve_${req._id}` }],
                [{ text: "❌ Reject", callback_data: `withdraw_reject_${req._id}` }]
            ]
        }
    });
});

bot.action(/withdraw_(approve|reject)_(.*)/, async (ctx) => {
    const action = ctx.match[1];
    const id = ctx.match[2];
    const status = action === 'approve' ? 'Approved' : 'Rejected';
    const req = await Withdraw.findByIdAndUpdate(id, { status: status });

    if (action === 'reject') {
        await User.findOneAndUpdate({ user_id: req.user_id }, { $inc: { balance: req.amount } });
    }

    bot.telegram.sendMessage(req.user_id, `Withdrawal Status: ${status} ${action === 'approve' ? '✅' : '❌'}`);
    ctx.editMessageText(`Request ${status}!`);
});

bot.action('start_broadcast', (ctx) => {
    ctx.reply("Reply to this message with the text you want to send to ALL users.");
});

bot.on('text', async (ctx) => {
    if (ctx.from.id === CONFIG.ADMIN_ID && ctx.message.reply_to_message) {
        const users = await User.find();
        let success = 0;
        for (let u of users) {
            try { await bot.telegram.sendMessage(u.user_id, ctx.message.text); success++; } catch(e) {}
        }
        ctx.reply(`📢 Broadcast finished. Sent to ${success} users.`);
    }
});

bot.launch();

// 4. API Endpoints
app.get('/api/user/:id', async (req, res) => {
    res.json(await User.findOne({ user_id: req.params.id }));
});

app.post('/api/withdraw', async (req, res) => {
    const { user_id, amount, wallet } = req.body;
    const user = await User.findOne({ user_id });
    if (user && user.balance >= amount && amount >= CONFIG.MIN_WITHDRAW) {
        user.balance -= amount; await user.save();
        await new Withdraw({ user_id, username: user.username, amount, wallet }).save();
        res.json({ status: 'success' });
    } else res.status(400).json({ error: 'Failed' });
});

// Tasks API
app.get('/api/tasks/:id', async (req, res) => {
    const user = await User.findOne({ user_id: req.params.id });
    res.json(TASKS.map(t => ({ ...t, completed: user?.completedTasks.includes(t.id) })));
});

app.post('/api/complete-task', async (req, res) => {
    const { user_id, task_id } = req.body;
    const user = await User.findOne({ user_id });
    const task = TASKS.find(t => t.id === task_id);
    if (user && task && !user.completedTasks.includes(task_id)) {
        user.balance += task.reward;
        user.completedTasks.push(task_id);
        await user.save();
        res.json({ success: true, balance: user.balance });
    } else res.status(400).json({ error: 'Already done' });
});

const PORT = process.env.PORT || 3000; // Use 3000 for Replit stability
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));

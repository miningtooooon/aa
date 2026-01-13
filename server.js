const express = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const app = express();

app.use(express.json());
app.use(express.static('./'));

// 1. Database Connection
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
    console.error("❌ Error: MONGODB_URI is not defined!");
} else {
    mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => console.log('✅ Connected to MongoDB Atlas'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
}

// 2. User Data Model
const userSchema = new mongoose.Schema({
    user_id: String,
    balance: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    lastMiningStart: Date,
    isMining: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// 3. Telegram Bot Configuration
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 8260431304; // Your Admin ID

bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const startPayload = ctx.startPayload; // Referral code (referrer ID)

    try {
        let user = await User.findOne({ user_id: userId });
        if (!user) {
            user = new User({ user_id: userId });
            
            // Referral Logic
            if (startPayload && startPayload !== userId) {
                const referrer = await User.findOne({ user_id: startPayload });
                if (referrer) {
                    referrer.referrals += 1;
                    referrer.balance += 2.0; // Referral Bonus
                    await referrer.save();
                    console.log(`✅ Referral bonus added to: ${startPayload}`);
                }
            }
            await user.save();
        }
    } catch (err) {
        console.error("Registration Error:", err);
    }

    return ctx.reply('Welcome to TON Pro Miner! Tap the button below to start mining.', {
        reply_markup: {
            inline_keyboard: [[{ text: "⛏️ Open App", web_app: { url: process.env.WEBAPP_URL } }]]
        }
    });
});

// Admin Command
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Access Denied: Admin Only.");

    try {
        const totalUsers = await User.countDocuments();
        const totalBalance = await User.aggregate([{ $group: { _id: null, sum: { $sum: "$balance" } } }]);
        
        const stats = `
📊 **Admin Dashboard:**
---
👥 Total Users: ${totalUsers}
💰 Total Distributed Balance: ${totalBalance[0]?.sum.toFixed(2) || 0} TON
        `;
        
        ctx.reply(stats);
    } catch (err) {
        ctx.reply("Error fetching statistics.");
    }
});

bot.launch();
console.log('✅ Telegram bot is running...');

// 4. API Endpoints
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        let user = await User.findOne({ user_id: userId });
        if (!user) {
            user = new User({ user_id: userId });
            await user.save();
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/start-mining', async (req, res) => {
    try {
        const { user_id } = req.body;
        const user = await User.findOne({ user_id });
        if (user) {
            user.lastMiningStart = new Date();
            user.isMining = true;
            await user.save();
            res.json({ status: 'started' });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/collect-mining', async (req, res) => {
    try {
        const { user_id } = req.body;
        const user = await User.findOne({ user_id });
        if (user && user.isMining) {
            const now = new Date();
            const startTime = new Date(user.lastMiningStart);
            const diffInMinutes = (now - startTime) / 1000 / 60;

            if (diffInMinutes >= 19.5) {
                user.balance += 1.0;
                user.isMining = false;
                await user.save();
                res.json({ status: 'success', balance: user.balance });
            } else {
                res.status(400).json({ status: 'error', message: 'Time not finished!' });
            }
        } else {
            res.status(400).json({ status: 'error', message: 'No active session' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Server Start
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

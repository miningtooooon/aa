const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());
app.use(express.static('./')); // لعرض ملف index.html تلقائياً

// الاتصال بقاعدة البيانات باستخدام المتغير الذي وضعناه في Koyeb
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// نموذج بيانات المستخدم
const userSchema = new mongoose.Schema({
    user_id: String,
    balance: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    lastMiningStart: Date,
    isMining: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// المسارات (APIs)
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const referrerId = req.query.start;
        let user = await User.findOne({ user_id: userId });

        if (!user) {
            user = new User({ user_id: userId });
            if (referrerId && referrerId !== userId) {
                const referrer = await User.findOne({ user_id: referrerId });
                if (referrer) {
                    referrer.referrals += 1;
                    referrer.balance += 2.0;
                    await referrer.save();
                }
            }
            await user.save();
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/start-mining', async (req, res) => {
    const { user_id } = req.body;
    const user = await User.findOne({ user_id });
    if (user) {
        user.lastMiningStart = new Date();
        user.isMining = true;
        await user.save();
        res.json({ status: 'started' });
    }
});

app.post('/api/collect-mining', async (req, res) => {
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
            res.status(400).json({ status: 'error', message: 'الوقت لم ينتهِ بعد!' });
        }
    } else {
        res.status(400).json({ status: 'error', message: 'لا توجد جلسة نشطة' });
    }
});

// تشغيل السيرفر على المنفذ المتغير
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

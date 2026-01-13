const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());
app.use(express.static('./')); 

const mongoURI = process.env.MONGODB_URI;

// التحقق من الرابط قبل الاتصال
if (!mongoURI) {
    console.error("خطأ: لم يتم العثور على MONGODB_URI في إعدادات Koyeb!");
} else {
    mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ Error connecting to MongoDB:', err));
}

const userSchema = new mongoose.Schema({
    user_id: String,
    balance: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    lastMiningStart: Date,
    isMining: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

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
    try {
        const { user_id } = req.body;
        const user = await User.findOne({ user_id });
        if (user) {
            user.lastMiningStart = new Date();
            user.isMining = true;
            await user.save();
            res.json({ status: 'started' });
        }
    } catch (e) { res.status(500).send(e); }
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
                res.status(400).json({ status: 'error', message: 'الوقت لم ينتهِ بعد!' });
            }
        } else {
            res.status(400).json({ status: 'error', message: 'لا توجد جلسة نشطة' });
        }
    } catch (e) { res.status(500).send(e); }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

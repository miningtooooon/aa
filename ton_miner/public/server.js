const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

// الاتصال بقاعدة البيانات
mongoose.connect('mongodb://localhost:27017/ton_miner');

// نموذج بيانات المستخدم المطور
const userSchema = new mongoose.Schema({
    user_id: String,
    balance: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    lastMiningStart: Date, // لتسجيل وقت بداية الجلسة
    isMining: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// 1. جلب بيانات المستخدم وإدارة الإحالات
app.get('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.start; // معرف الشخص الذي دعا المستخدم

    let user = await User.findOne({ user_id: userId });

    if (!user) {
        user = new User({ user_id: userId });
        
        // إذا جاء عن طريق رابط إحالة
        if (referrerId && referrerId !== userId) {
            const referrer = await User.findOne({ user_id: referrerId });
            if (referrer) {
                referrer.referrals += 1;
                referrer.balance += 2.0; // إضافة مكافأة الإحالة (2 TON)
                await referrer.save();
            }
        }
        await user.save();
    }
    res.json(user);
});

// 2. بدء جلسة التعدين في السيرفر
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

// 3. إنهاء الجلسة وإضافة الرصيد (التحقق من الوقت)
app.post('/api/collect-mining', async (req, res) => {
    const { user_id } = req.body;
    const user = await User.findOne({ user_id });

    if (user && user.isMining) {
        const now = new Date();
        const startTime = new Date(user.lastMiningStart);
        const diffInMinutes = (now - startTime) / 1000 / 60;

        // التحقق: هل مرت 20 دقيقة فعلاً؟
        if (diffInMinutes >= 19.5) { // سماح بـ 30 ثانية فرق بسيط
            user.balance += 1.0; // إضافة 1 TON فقط
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

app.listen(3000, () => console.log('Server is running...'));

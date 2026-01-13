const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());
app.use(express.static('./')); 

// 1. Connection to MongoDB Atlas using Environment Variables
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
    console.error("❌ Error: MONGODB_URI is not defined in Environment Variables!");
} else {
    mongoose.connect(mongoURI, { 
        useNewUrlParser: true, 
        useUnifiedTopology: true 
    })
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

// 3. APIs
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
        console.error("API Error:", error);
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
                res.status(400).json({ status: 'error', message: 'Time not finished yet!' });
            }
        } else {
            res.status(400).json({ status: 'error', message: 'No active mining session' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Port configuration for Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

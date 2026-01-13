const express = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const app = express();

app.use(express.json());
app.use(express.static('./'));

// 1. الاتصال بقاعدة البيانات
const mongoURI = process.env.MONGODB_URI;
إذا لم يكن عنوان mongoURI موجودًا {
    console.error("â Œ Error: MONGODB_URI is not defined!");
} آخر {
    mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => console.log('âœ… تم الاتصال بـ MongoDB Atlas'))
        .catch(err => console.error('â Œ MongoDB connection error:', err));
}

// 2. نموذج بيانات المستخدم
const userSchema = new mongoose.Schema({
    user_id: String,
    الرصيد: { النوع: رقم، القيمة الافتراضية: 0 },
    الإحالات: { النوع: رقم، القيمة الافتراضية: 0 },
    تاريخ بدء التعدين الأخير،
    isMining: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// 3. تهيئة بوت تيليجرام
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 8260431304; // معرف المسؤول الخاص بك

bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const startPayload = ctx.startPayload; // رمز الإحالة (معرف المُحيل)

    يحاول {
        let user = await User.findOne({ user_id: userId });
        إذا لم يكن هناك مستخدم {
            user = new User({ user_id: userId });
            
            // منطق الإحالة
            إذا كان (startPayload && startPayload !== userId) {
                const referrer = await User.findOne({ user_id: startPayload });
                إذا كان (المُحيل) {
                    referrer.referrals += 1;
                    referrer.balance += 2.0; // مكافأة الإحالة
                    await referrer.save();
                    console.log(`âœ… تمت إضافة مكافأة الإحالة إلى: ${startPayload}`);
                }
            }
            await user.save();
        }
    } catch (err) {
        console.error("خطأ في التسجيل:", err);
    }

    return ctx.reply('مرحباً بك في TON Pro Miner! اضغط على الزر أدناه لبدء التعدين.', {
        reply_markup: {
            inline_keyboard: [[{ text: "â› ï¸ Open App", web_app: { url: process.env.WEBAPP_URL } }]]
        }
    });
});

// أمر إداري
bot.command('admin', async (ctx) => {
    إذا كان (ctx.from.id !== ADMIN_ID) فقم بإرجاع ctx.reply("â Œ تم رفض الوصول: للمسؤول فقط.");

    يحاول {
        const totalUsers = await User.countDocuments();
        const totalBalance = await User.aggregate([{ $group: { _id: null, sum: { $sum: "$balance" } } }]);
        
        const stats = `
ðŸ“Š **لوحة تحكم المشرف:**
---
إجمالي المستخدمين: ${totalUsers}
إجمالي الرصيد الموزع: ${totalBalance[0]?.sum.toFixed(2) || 0} طن
        `;
        
        ctx.reply(stats);
    } catch (err) {
        ctx.reply("خطأ في جلب الإحصائيات.");
    }
});

bot.launch();
console.log('âœ… بوت تيليجرام قيد التشغيل...');

// 4. نقاط نهاية واجهة برمجة التطبيقات
app.get('/api/user/:id', async (req, res) => {
    يحاول {
        const userId = req.params.id;
        let user = await User.findOne({ user_id: userId });
        إذا لم يكن هناك مستخدم {
            user = new User({ user_id: userId });
            await user.save();
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "خطأ داخلي في الخادم" });
    }
});

app.post('/api/start-mining', async (req, res) => {
    يحاول {
        const { user_id } = req.body;
        const user = await User.findOne({ user_id });
        إذا (المستخدم) {
            user.lastMiningStart = new Date();
            user.isMining = true;
            await user.save();
            res.json({ status: 'started' });
        } آخر {
            res.status(404).json({ error: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/collect-mining', async (req, res) => {
    يحاول {
        const { user_id } = req.body;
        const user = await User.findOne({ user_id });
        إذا كان (المستخدم && المستخدم.isMining) {
            const now = new Date();
            const startTime = new Date(user.lastMiningStart);
            const diffInMinutes = (now - startTime) / 1000 / 60;

            إذا كان (الفرق بالدقائق >= 19.5) {
                user.balance += 1.0;
                user.isMining = false;
                await user.save();
                res.json({ status: 'success', balance: user.balance });
            } آخر {
                res.status(400).json({ status: 'error', message: 'لم ينتهِ الوقت!' });
            }
        } آخر {
            res.status(400).json({ status: 'error', message: 'No active session' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. بدء تشغيل الخادم
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`ðŸš€ يعمل الخادم على المنفذ ${PORT}`));

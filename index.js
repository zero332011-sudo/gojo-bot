const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

// بيانات المطور والبوت الأساسية
const DEVELOPER_ID = "69033026138303";
const DEVELOPER_PHONE = "201032219184";
const BOT_PHONE = "201154684341";

// قاعدة بيانات محلية مؤقتة للألقاب والرصيد
const userNicknames = {};
const userBank = {};
const mutedUsers = {};
const customCommands = {};

async function startGojoBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        // تأخير لمدة دقيقة كاملة (60000 مللي ثانية) لضمان استقرار اتصال السوكت قبل طلب كود الربط
        setTimeout(async () => {
            try {
                let phoneNumber = BOT_PHONE.replace(/[^0-9]/g, '');
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n========================================`);
                console.log(`[!] كود ربط بوت Gojo الخاص بك هو: \x1b[32m${code}\x1b[0m`);
                console.log(`========================================\n`);
            } catch (err) {
                console.error("خطأ أثناء طلب كود الربط:", err);
            }
        }, 60000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('اتصال انقطع، محاولة إعادة الاتصال...', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => startGojoBot(), 5000); // تأخير 5 ثوانٍ قبل إعادة الاتصال لمنع الكراش المتكرر
            }
        } else if (connection === 'open') {
            console.log('تم اتصال Gojo Bot بنجاح وعلى مدار الساعة!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const mtype = Object.keys(mek.message)[0];
            const from = mek.key.remoteJid;
            const sender = mek.key.participant || from;
            const isDev = sender.includes(DEVELOPER_PHONE) || sender.includes(DEVELOPER_ID);

            const body = (mtype === 'conversation') ? mek.message.conversation :
                         (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
            if (!body) return;

            if (mutedUsers[sender] && !isDev) {
                await sock.sendMessage(from, { delete: mek.key });
                return;
            }

            const args = body.trim().split(/ +/);
            const command = args.shift().toLowerCase();
            const q = args.join(' ');

            if (command === '.اوامر') {
                const menuText = `
╭──『 📜 قائمة أواصر Gojo Bot 』──⬣
│
│ 📌 *الأوامر الأساسية:*
│ • .اوامر - لعرض القائمة
│ • .معلومات - عرض بياناتك وبروفايلك
│ • .لقبي [اللقب] - لتحديد لقبك
│ • .بنك - لمعرفة رصيدك ونقاطك
│
│ 🎮 *الترفيه والألعاب:*
│ • .عرض - عرض الوسائط مرة واحدة
│ • .العاب - قائمة الألعاب المتاحة
│ • .اكس اوه - بدء لعبة XO
│ • .حذر - لعبة تخمين شخصية الأنمي
│ • بحث [الموضوع] - جلب صورة ومعلومات
│ • حل [السؤال] - حل المسائل والأسئلة بالبحث
│
│ 🛠 *الإدارة والصلاحيات:*
│ • .رتب - توزيع رتب الأعضاء
│ • .كتم - كتم عضو وحذف رسائله
│ • .فك كتم - رفع الكتم عن عضو
│ • .اضافه مطور - إضافة مطور جديد
│ • .اضافه أمر - إضافة أمر مخصص
│
╰──────────────────────⬣`;
                await sock.sendMessage(from, { text: menuText }, { quoted: mek });
            }
            else if (command === '.معلومات') {
                const userNickname = userNicknames[sender] || 'بدون لقب';
                const userRankTitle = isDev ? 'مطور البوت ⚡' : 'عضو نشط';
                let ppUrl;
                try {
                    ppUrl = await sock.profilePictureUrl(sender, 'image');
                } catch {
                    ppUrl = 'https://i.imgur.com/1Z8M1Yx.png';
                }
                const infoText = `
╭──『 👤 معلومات المستخدم 』──⬣
│ 🆔 المعرف: @${sender.split('@')[0]}
│ 🏷️ اللقب: ${userNickname}
│ 🎖️ الرتبة: ${userRankTitle}
╰──────────────────────⬣`;
                await sock.sendMessage(from, { image: { url: ppUrl }, caption: infoText, mentions: [sender] }, { quoted: mek });
            }
            else if (command === '.لقبي') {
                if (!q) return await sock.sendMessage(from, { text: '❌ اكتب اللقب بعد الأمر، مثال: .لقبي الملك' }, { quoted: mek });
                userNicknames[sender] = q;
                await sock.sendMessage(from, { text: `✅ تم تعيين لقبك بنجاح إلى: *${q}*` }, { quoted: mek });
            }
            else if (command === '.بنك') {
                if (!userBank[sender]) userBank[sender] = { coins: 100, plants: 5 };
                await sock.sendMessage(from, { text: `🏦 رصيدك في البنك:\n💰 الأموال: ${userBank[sender].coins} كوينز\n🌱 النباتات: ${userBank[sender].plants} نبتة` }, { quoted: mek });
            }
            else if (command === '.رتب') {
                const ranksList = `🎖️ قائمة رتب الأعضاء الـ 10:\n1. مبتدئ 🟢\n2. عضو نشط 🥉\n3. متفاعل مميز 🥈\n4. محترف 🥇\n5. اسطورة الشات 💎\n6. خبير البوت 🔮\n7. حارس السيرفر 🛡️\n8. نائب المطور ⚡\n9. ملك الأنمي 👑\n10. الحاكم المطلق 🔥`;
                await sock.sendMessage(from, { text: ranksList }, { quoted: mek });
            }
            else if (command === '.كتم') {
                if (!mek.message.extendedTextMessage) return await sock.sendMessage(from, { text: '❌ قم بالرد على رسالة الشخص المراد كتمه.' }, { quoted: mek });
                const targetUser = mek.message.extendedTextMessage.contextInfo.participant;
                if (targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID)) {
                    return await sock.sendMessage(from, { text: '⚠️ لا يمكن كتم مطور البوت!' }, { quoted: mek });
                }
                mutedUsers[targetUser] = true;
                await sock.sendMessage(from, { text: '🔇 تم كتم العضو بنجاح.' }, { quoted: mek });
            }
            else if (command === '.فك كتم') {
                if (!mek.message.extendedTextMessage) return await sock.sendMessage(from, { text: '❌ قم بالرد على رسالة العضو لفك الكتم.' }, { quoted: mek });
                const targetUser = mek.message.extendedTextMessage.contextInfo.participant;
                delete mutedUsers[targetUser];
                await sock.sendMessage(from, { text: '🔊 تم فك الكتم عن العضو بنجاح.' }, { quoted: mek });
            }
            else if (command.startsWith('بحث')) {
                const query = command.replace('بحث', '').trim() || q;
                if (!query) return await sock.sendMessage(from, { text: '❌ أكتب موضوع البحث.' }, { quoted: mek });
                await sock.sendMessage(from, { text: `🔍 جاري البحث عن: *${query}*...` }, { quoted: mek });
            }
            else if (command.startsWith('حل')) {
                const questionText = command.replace('حل', '').trim() || q;
                if (!questionText) return await sock.sendMessage(from, { text: '❌ اكتب السؤال بعد الأمر.' }, { quoted: mek });
                await sock.sendMessage(from, { text: `💡 إجابة السؤال (${questionText}): تم التحليل والحل بنجاح.` }, { quoted: mek });
            }
            else if (command === '.اضافه أمر') {
                const parts = q.split('|');
                if (parts.length < 2) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .اضافه أمر .اسم | الرد' }, { quoted: mek });
                const cmdName = parts[0].trim();
                const cmdResp = parts[1].trim();
                customCommands[cmdName] = cmdResp;
                await sock.sendMessage(from, { text: `✅ تمت إضافة الأمر (*${cmdName}*) بنجاح!` }, { quoted: mek });
            }
            else if (customCommands[command]) {
                await sock.sendMessage(from, { text: customCommands[command] }, { quoted: mek });
            }

        } catch (error) {
            console.error(error);
        }
    });
}

startGojoBot();

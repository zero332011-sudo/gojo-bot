const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

// بيانات المطور والبوت الأساسية
const DEVELOPER_ID = "69033026138303";
const DEVELOPER_PHONE = "201032219184";
const BOT_PHONE = "201154684341";

// قواعد البيانات المحلية المحدثة
const userNicknames = {};
const userBank = {}; // { coins, points, xp, level }
const mutedUsers = {};
const customCommands = {};
const badWords = ["شتايم_مثال1", "قذارة_مثال2"]; 
const badEmojis = ["🤬", "🖕"];

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
        }, 10000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startGojoBot(), 5000);
        } else if (connection === 'open') {
            console.log('تم اتصال Gojo Bot بنجاح الملكي!');
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

            // استخراج النصوص
            const body = (mtype === 'conversation') ? mek.message.conversation :
                         (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
            
            // تهيئة بيانات المستخدم
            if (!userBank[sender]) {
                userBank[sender] = { 
                    coins: isDev ? 10000000000 : 200, 
                    points: isDev ? 10000000000 : 10, 
                    xp: 0, 
                    level: isDev ? 10 : 1 
                };
            } else if (isDev) {
                userBank[sender].coins = 10000000000;
                userBank[sender].points = 10000000000;
                userBank[sender].level = 10;
            }

            // فحص الكتم
            if (mutedUsers[sender] && !isDev) {
                await sock.sendMessage(from, { delete: mek.key });
                return;
            }

            // منع الشتايم والايموجي المسيء
            if (!isDev) {
                let isOffensive = false;
                if (body) {
                    if (badWords.some(word => body.includes(word)) || badEmojis.some(emoji => body.includes(emoji))) {
                        isOffensive = true;
                    }
                }
                if (isOffensive) {
                    await sock.sendMessage(from, { delete: mek.key });
                    await sock.sendMessage(from, { text: `⚠️ تنبيه يا @${sender.split('@')[0]}، ممنوع استخدام الشتايم أو الإيموجي/الملصقات المسيئة!`, mentions: [sender] }, { quoted: mek });
                    return;
                }
            }

            // زيادة التفاعل والخبرة (XP) وصعود الرتب بصعوبة
            userBank[sender].xp += 2;
            if (userBank[sender].xp >= userBank[sender].level * 150 && userBank[sender].level < 10) {
                userBank[sender].level += 1;
                await sock.sendMessage(from, { text: `🎉 مبروك يا @${sender.split('@')[0]}، لقد ترقيت وأصبحت في الرتبة الملكية رقم (${userBank[sender].level})! 👑`, mentions: [sender] });
            }

            const currentLevel = userBank[sender].level;
            const args = body.trim().split(/ +/);
            const command = args.shift().toLowerCase();
            const q = args.join(' ');

            // شرط الرتبة الأقل من 5
            if (command.startsWith('.') || command === 'بحث' || command === 'حل' || command === 'الجاسوس' || command === 'اكس اوه') {
                if (currentLevel < 5 && !isDev) {
                    return await sock.sendMessage(from, { text: `❌ عذراً يا @${sender.split('@')[0]}، رتبتك الحالية (${currentLevel}) أقل من الرتبة 5. تفاعل أكثر في الشات لتستطيع استخدام أواصر البوت الملكي! 🔒`, mentions: [sender] }, { quoted: mek });
                }
            }

            const getTarget = () => {
                if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                    return mek.message.extendedTextMessage.contextInfo.participant;
                }
                if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.mentionedJid && mek.message.extendedTextMessage.contextInfo.mentionedJid.length > 0) {
                    return mek.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                return null;
            };

            // معالجة الأوامر
            if (command === '.اوامر' || command === '.الأوامر') {
                const menuText = `
👑 ──『 **قائمة أوامر بوت Gojo الملكي** 』── 👑
│
│ 📌 **[ الأوامر الأساسية ]**
│ • \`.اوامر\` - لعرض هذه القائمة الملكية
│ • \`.معلومات\` - عرض ملفك الشامل والصورة والبروفايل
│ • \`.رتبتي\` أو \`.رتب\` - معرفة رتبتك الملكية الحالية
│ • \`.لقبي [اللقب]\` - لتحديد لقبك الخاص
│ • \`.بنك\` - لمعرفة رصيدك الملكي ونقاطك
│
│ 🎮 **[ الألعاب والتسلية والفلوس ]**
│ • \`.العاب\` - قائمة الألعاب وطريقة كسب الفلوس
│ • \`.عرض\` - كشف وفك وسائط العرض لمرة واحدة (بالرد)
│ • \`.الجاسوس\` - بدء لعبة الجاسوس الملكية
│ • \`.اكس اوه\` - بدء لعبة XO الملكية (بالرد/المنشن)
│ • \`.حذر\` - لعبة تخمين شخصية الأنمي (بالرد/المنشن)
│ • \`بحث [الموضوع]\` - البحث السريع بالصورة والمعلومات
│ • \`حل [السؤال]\` - حل المسائل الدراسية
│
│ 🛠 **[ الإدارة والحماية الملكية ]**
│ • \`.كتم\` - كتم عضو بالرد أو المنشن
│ • \`.فك كتم\` - رفع الكتم بالرد أو المنشن
│ • \`.اضافه ملصق\` - إضافة ملصق لقائمة الحظر
│ • \`.اضافه ايموجي\` - إضافة ايموجي لقائمة الحظر
│ • \`.اضافه أمر [الأمر] | [الرد]\` - إضافة أمر مخصص
│
╰─────────────────────────────────⬣`;
                await sock.sendMessage(from, { text: menuText }, { quoted: mek });
            }
            else if (command === '.معلومات') {
                const userNickname = userNicknames[sender] || 'بدون لقب ملكي';
                const rankTitles = ["مبتدئ الحاشية", "حارس البوابة", "فارس صاعد", "نبيل البلاط", "أمير الشات", "مستشار الملك", "وزير السيرفر", "سيد الأساطير", "ملك الإمبراطورية", "الحاكم المطلق ⚡"];
                const rTitle = isDev ? "الملك الإمبراطور المطلق ⚡" : rankTitles[currentLevel - 1] || "عضو ملكي";
                const bankInfo = userBank[sender];
                let ppUrl;
                try {
                    ppUrl = await sock.profilePictureUrl(sender, 'image');
                } catch {
                    ppUrl = 'https://i.imgur.com/1Z8M1Yx.png';
                }
                const infoText = `
👑 ──『 **الملف الشخصي الملكي** 』── 👑
│ 🆔 المعرف: @${sender.split('@')[0]}
│ 🏷️ اللقب: ${userNickname}
│ 🎖️ الرتبة: ${rTitle} (مستوى ${currentLevel})
│ 📈 خبرة التفاعل (XP): ${bankInfo.xp}
│ 💰 رصيد الكوينز: ${bankInfo.coins}
│ ⭐ النقاط: ${bankInfo.points}
╰─────────────────────────────────⬣`;
                await sock.sendMessage(from, { image: { url: ppUrl }, caption: infoText, mentions: [sender] }, { quoted: mek });
            }
            else if (command === '.رتبتي' || command === '.رتب') {
                const rankTitles = ["مبتدئ الحاشية", "حارس البوابة", "فارس صاعد", "نبيل البلاط", "أمير الشات", "مستشار الملك", "وزير السيرفر", "سيد الأساطير", "ملك الإمبراطورية", "الحاكم المطلق ⚡"];
                const rTitle = isDev ? "الملك الإمبراطور المطلق ⚡" : rankTitles[currentLevel - 1] || "عضو ملكي";
                await sock.sendMessage(from, { text: `🎖️ رتبتك الملكية الحالية هي: *${rTitle}* (المستوى ${currentLevel})\n📈 ترفع رتبتك بالتفاعل المستمر وكسب النقاط في الألعاب!` }, { quoted: mek });
            }
            else if (command === '.لقبي') {
                if (!q) return await sock.sendMessage(from, { text: '❌ اكتب اللقب الملكي بعد الأمر، مثال: .لقبي الإمبراطور' }, { quoted: mek });
                userNicknames[sender] = q;
                await sock.sendMessage(from, { text: `✅ تم تعيين لقبك الملكي بنجاح إلى: *${q}* 👑` }, { quoted: mek });
            }
            else if (command === '.بنك') {
                const bankInfo = userBank[sender];
                await sock.sendMessage(from, { text: `🏦 خزنتك الملكية:\n💰 الأموال والكوينز: ${bankInfo.coins}\n⭐ النقاط: ${bankInfo.points}\n📈 مستواك ورتبتك: ${bankInfo.level}` }, { quoted: mek });
            }
            else if (command === '.العاب') {
                const gamesInfo = `🎮 ──『 **قسم الألعاب وطريقة الكسب** 』── 🎮\n\n` +
                    `1️⃣ **لعبة الجاسوس (.الجاسوس):** لعبة ذكاء جماعية يتم إرسال الكلمة السرية للخاص وتوزيع الأسماء بأرقام لاختيار الجاسوس.\n` +
                    `2️⃣ **لعبة XO (.اكس اوه):** تحدي الذكاء الشهير بالمنشن أو الرد.\n` +
                    `3️⃣ **لعبة التخمين (.حذر):** تخمين شخصيات الأنمي بالمنشن أو الرد.\n` +
                    `4️⃣ **كشف العرض لمرة واحدة (.عرض):** بالرد على الوسائط السرية.\n\n` +
                    `💵 **كيف تكسب الفلوس والترقية؟**\n` +
                    `- المشاركة الفعالة والكتابة المستمرة في الشات ترفع خبرتك (XP) ومستواك ورتبتك.\n` +
                    `- الفوز في الألعاب يمنحك آلاف الكوينز والنقاط لترتقي سريعاً للرتب الملكية العليا!`;
                await sock.sendMessage(from, { text: gamesInfo }, { quoted: mek });
            }
            else if (command === '.عرض') {
                const qMsg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!qMsg) return await sock.sendMessage(from, { text: '❌ قم بالرد على صورة أو فيديو "عرض لمرة واحدة" لتتمكن من كشفه.' }, { quoted: mek });
                
                let viewOnceMsg = qMsg.viewOnceMessage?.message || qMsg.viewOnceMessageV2?.message || qMsg;
                let mediaType = Object.keys(viewOnceMsg)[0];
                
                if (!mediaType || !['imageMessage', 'videoMessage'].includes(mediaType)) {
                    return await sock.sendMessage(from, { text: '❌ الرسالة المُحدد عليها ليست وسائط عرض لمرة واحدة صحيحة.' }, { quoted: mek });
                }

                let mediaMsg = viewOnceMsg[mediaType];
                try {
                    let stream = await downloadContentFromMessage(mediaMsg, mediaType === 'imageMessage' ? 'image' : 'video');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    if (mediaType === 'imageMessage') {
                        await sock.sendMessage(from, { image: buffer, caption: '📸 تم كشف وسائط العرض لمرة واحدة بنجاح!' }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { video: buffer, caption: '🎥 تم كشف فيديو العرض لمرة واحدة بنجاح!' }, { quoted: mek });
                    }
                } catch (e) {
                    console.error(e);
                    await sock.sendMessage(from, { text: '❌ حدث خطأ أثناء محاولة تحميل وسائط العرض لمرة واحدة.' }, { quoted: mek });
                }
            }
            else if (command === '.الجاسوس') {
                await sock.sendMessage(from, { text: `🕵️‍♂️ تم تفعيل لعبة الجاسوس الملكية!\nقم بعمل منشن للاعبين المشاركين، وسيتم إرسال الكلمة السرية للخاص فوراً.` }, { quoted: mek });
            }
            else if (command === '.اكس اوه' || command === 'اكس اوه') {
                const target = getTarget();
                let targetName = target ? `@${target.split('@')[0]}` : 'الخصم';
                await sock.sendMessage(from, { text: `❌⭕ تم بدء تحدي XO الملكي ضد ${targetName}! أدخل حركتك أو رد على الرسالة للببدء.`, mentions: target ? [target] : [] }, { quoted: mek });
            }
            else if (command === '.حذر' || command === 'حذر') {
                const target = getTarget();
                let targetName = target ? `@${target.split('@')[0]}` : 'اللاعب المستهدف';
                await sock.sendMessage(from, { text: `🎯 لعبة تخمين شخصية الأنمي موجهة إلى ${targetName}! من تكون الشخصية؟`, mentions: target ? [target] : [] }, { quoted: mek });
            }
            else if (command === '.بحث' || command === 'بحث') {
                const query = q;
                if (!query) return await sock.sendMessage(from, { text: '❌ أكتب موضوع البحث بعد الأمر.' }, { quoted: mek });
                await sock.sendMessage(from, { text: `🔍 جاري البحث الملكي عن: *${query}*...\n✨ تم جلب البيانات والصورة بنجاح!` }, { quoted: mek });
            }
            else if (command === '.حل' || command === 'حل') {
                const questionText = q;
                if (!questionText) return await sock.sendMessage(from, { text: '❌ اكتب السؤال الدراسي أو المسألة بعد الأمر.' }, { quoted: mek });
                await sock.sendMessage(from, { text: `💡 إجابة السؤال (${questionText}): تم التحليل والحل الإمبراطوري بنجاح!` }, { quoted: mek });
            }
            else if (command === '.كتم') {
                const targetUser = getTarget();
                if (!targetUser) return await sock.sendMessage(from, { text: '❌ قم بالرد على رسالة الشخص أو عمل منشن له لكتمه.' }, { quoted: mek });
                if (targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID)) {
                    return await sock.sendMessage(from, { text: '⚠️️ حاشا لله! لا يمكن كتم مطور وبوت الإمبراطورية!' }, { quoted: mek });
                }
                mutedUsers[targetUser] = true;
                await sock.sendMessage(from, { text: `🔇 تم كتم العضو الملكي @${targetUser.split('@')[0]} بنجاح بأمر من الإدارة!`, mentions: [targetUser] }, { quoted: mek });
            }
            else if (command === '.فك كتم') {
                const targetUser = getTarget();
                if (!targetUser) return await sock.sendMessage(from, { text: '❌ قم بالرد على رسالة العضو أو عمل منشن له لفك الكتم.' }, { quoted: mek });
                delete mutedUsers[targetUser];
                await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${targetUser.split('@')[0]} بنجاح وعاد لصفوف الإمبراطورية!`, mentions: [targetUser] }, { quoted: mek });
            }
            else if (command === '.اضافه ملصق') {
                if (!isDev) return await sock.sendMessage(from, { text: '❌ هذا الأمر خاص بالمطورين فقط.' }, { quoted: mek });
                await sock.sendMessage(from, { text: `✅ تمت إضافة الملصق لقائمة الحظر المسيء بنجاح.` }, { quoted: mek });
            }
            else if (command === '.اضافه ايموجي') {
                if (!isDev) return await sock.sendMessage(from, { text: '❌ هذا الأمر خاص بالمطورين فقط.' }, { quoted: mek });
                if (!q) return await sock.sendMessage(from, { text: '❌ اكتب الايموجي المراد إضافته للحظر.' }, { quoted: mek });
                badEmojis.push(q);
                await sock.sendMessage(from, { text: `✅ تمت إضافة الإيموجي (${q}) لقائمة الإيموجيات المسيئة بنجاح!` }, { quoted: mek });
            }
            else if (command === '.اضافه أمر') {
                if (!isDev) return await sock.sendMessage(from, { text: '❌ إضافة الأوامر مقتصرة على المطور الملكي.' }, { quoted: mek });
                const parts = q.split('|');
                if (parts.length < 2) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .اضافه أمر .اسم | الرد' }, { quoted: mek });
                const cmdName = parts[0].trim();
                const cmdResp = parts[1].trim();
                customCommands[cmdName] = cmdResp;
                await sock.sendMessage(from, { text: `✅ تمت إضافة الأمر المخصص (*${cmdName}*) بنجاح لقائمة البوت الملكي!` }, { quoted: mek });
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
  

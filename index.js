const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');

const DEVELOPER_ID = "69033026138303";
const DEVELOPER_PHONE = "201032219184";
const BOT_PHONE = "201154684341";

const userNicknames = {};
const userBank = {}; 
const mutedUsers = {};
const customCommands = {};
const userWarnings = {};

const badWords = [
    "شرموط", "قحبة", "منيوك", "متناك", "خول", "عرص", "حاملة", "كلب", "ابن الكلب", "وسخ", "ابن الوسخة", 
    "منياك", "منيكة", "كس", "طيز", "زب", "عرجاء", "قذر", "حقير", "سافل", "حمار", "جحش", "ديوث", "عاهر", 
    "عاهرة", "شمال", "بنت الوسخة", "ابن الحرام", "يا ابن", "علق", "شراشير", "زفت", "نجس", "يا خول", "يا عرصه",
    "تفو", "لعنة", "قملة", "مأبون", "لوطي", "شاقط", "متعدد", "قحبة", "حسافة", "انقلع", "طير", "امك", "أختك",
    "احا", "يخرب بيتك", "يا حيوان", "يا زفت", "يا قذر", "يا حقير", "يا سافل", "يا زبالة", "اقفل صابك", "اخرس",
    "بقر", "تفه", "شحات", "ابن اللبوة", "لبوة", "عرصين", "خولات", "متناكة", "منيوكة", "كس امك", "طيزك",
    "لعن", "ابن ال...", "سكس", "جنس", "نيك", "منيوك", "شرموطة", "قحبات", "عاهرات", "زباب", "زبوبي"
];

const badEmojis = ["🤬", "🖕", "💩", "🤮", "🔪", "🧨", "🔞"];
const badStickers = [];

async function startGojoBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'fatal' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            browser: Browsers.macOS('Chrome'),
            generateHighQualityLinkPreview: true,
            syncFullHistory: false
        });

        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    let phoneNumber = BOT_PHONE.replace(/[^0-9]/g, '');
                    let code = await sock.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(`\n========================================`);
                    console.log(`[!] كود ربط بوت Gojo الخاص بك هو: \x1b[32m${code}\x1b[0m`);
                    console.log(`========================================\n`);
                } catch (err) {
                    console.error("خطأ أثناء طلب كود الربط:", err);
                }
            }, 6000);
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) setTimeout(() => startGojoBot(), 3000);
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
                
                const isDev = sender.includes(DEVELOPER_PHONE) || sender.includes(DEVELOPER_ID) || sender.includes(BOT_PHONE);
                const isBot = mek.key.fromMe || sender.includes(BOT_PHONE);

                const body = (mtype === 'conversation') ? mek.message.conversation :
                             (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
                
                if (!userBank[sender]) {
                    userBank[sender] = { coins: isDev ? 10000000000 : 200, points: isDev ? 10000000000 : 10, hearts: 3, xp: 0, level: isDev ? 10 : 1 };
                } else {
                    if (isDev) {
                        userBank[sender].coins = 10000000000;
                        userBank[sender].points = 10000000000;
                        userBank[sender].level = 10;
                    }
                    if (userBank[sender].hearts === undefined) userBank[sender].hearts = 3;
                }

                global.activeSpySessions = global.activeSpySessions || {};
                global.activeXoSessions = global.activeXoSessions || {};

                const getTarget = () => {
                    if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                        return mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.mentionedJid && mek.message.extendedTextMessage.contextInfo.mentionedJid.length > 0) {
                        return mek.message.extendedTextMessage.contextInfo.mentionedJid[0];
                    }
                    return null;
                };

                // نظام لعبة الجاسوس
                let spySession = global.activeSpySessions[from];
                if (spySession && spySession.state === 'waiting_joins' && (body.trim() === '.انضم' || body.trim() === 'انضم')) {
                    if (!spySession.players.includes(sender)) {
                        spySession.players.push(sender);
                        let pList = spySession.players.map((p, i) => `${i + 1}️⃣ @${p.split('@')[0]}`).join('\n');
                        await sock.sendMessage(from, { text: `🕵️‍♂️ **قائمة متسابقي الجاسوس:**\n${pList}\n\n(اكتب **.ابدأ جاسوس** لبدء الجولة)`, mentions: spySession.players }, { quoted: mek });
                    }
                    return;
                }

                if (spySession && spySession.state === 'waiting_joins' && (body.trim() === '.ابدأ جاسوس' || body.trim() === 'ابدأ جاسوس')) {
                    if (spySession.players.length < 3) {
                        return await sock.sendMessage(from, { text: `❌ يجب أن يكون هناك 3 لاعبين على الأقل لبدء لعبة الجاسوس!` }, { quoted: mek });
                    }
                    spySession.state = 'playing';
                    const secretWords = ["تفاحة", "سيارة", "كمبيوتر", "قلم", "طائرة", "مسجد", "بحر"];
                    const secretWord = secretWords[Math.floor(Math.random() * secretWords.length)];
                    const spyIndex = Math.floor(Math.random() * spySession.players.length);
                    spySession.spy = spySession.players[spyIndex];
                    spySession.secretWord = secretWord;
                    spySession.votes = {};

                    for (let p of spySession.players) {
                        try {
                            if (p === spySession.spy) {
                                await sock.sendMessage(p, { text: `🤫 أنت **الجاسوس** في هذه الجولة!` });
                            } else {
                                await sock.sendMessage(p, { text: `🔒 الكلمة السرية الخاصة بك هي: *${secretWord}*` });
                            }
                        } catch (e) {}
                    }

                    let playersListText = `🕵️‍♂️️ **بدأت لعبة الجاسوس الملكية!**\nالمتنافسون:\n`;
                    spySession.players.forEach((p, idx) => {
                        playersListText += `${idx + 1}️⃣ @${p.split('@')[0]}\n`;
                    });
                    playersListText += `\n📌 اكتب رقم المشتبه به للتصويت (مثال: \`1\`).`;
                    await sock.sendMessage(from, { text: playersListText, mentions: spySession.players });
                    return;
                }

                if (spySession && spySession.state === 'playing' && spySession.players.includes(sender)) {
                    let voteNum = parseInt(body.trim());
                    if (!isNaN(voteNum) && voteNum > 0 && voteNum <= spySession.players.length) {
                        let votedPlayer = spySession.players[voteNum - 1];
                        spySession.votes[sender] = votedPlayer;
                        await sock.sendMessage(from, { text: `✅ تم تسجيل صوتك يا @${sender.split('@')[0]}`, mentions: [sender] }, { quoted: mek });
                        return;
                    }
                }

                // نظام حلبة XO المحدثة
                let xoSession = global.activeXoSessions[from];
                if (xoSession && xoSession.state === 'waiting_joins' && (body.trim() === '.انضم اوه' || body.trim() === '.انضم اوة' || body.trim() === 'انضم اوه' || body.trim() === 'انضم اوة')) {
                    if (!xoSession.players.includes(sender)) {
                        xoSession.players.push(sender);
                        await sock.sendMessage(from, { text: `⚔️ انضم @${sender.split('@')[0]} لحلبة XO!`, mentions: [sender] }, { quoted: mek });
                        if (xoSession.players.length === 2) {
                            xoSession.state = 'playing';
                            xoSession.turn = xoSession.players[0];
                            xoSession.board = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
                            
                            const renderBoard = `🎮 **لعبة XO - اكس اوه** 🎮\n\n` +
                                `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                `───────────\n` +
                                `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                `───────────\n` +
                                `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                                `أنت X ❌ - الدور على العضو (@${xoSession.turn.split('@')[0]}) اختر رقماً:`;
                            await sock.sendMessage(from, { text: renderBoard, mentions: xoSession.players });
                        }
                    }
                    return;
                }

                if (xoSession && xoSession.state === 'playing' && xoSession.players.includes(sender)) {
                    if (sender !== xoSession.turn) {
                        return await sock.sendMessage(from, { text: `⚠ ليس دورك الآن يا @${sender.split('@')[0]}!`, mentions: [sender] }, { quoted: mek });
                    }
                    let cellChoice = parseInt(body.trim());
                    if (!isNaN(cellChoice) && cellChoice >= 1 && cellChoice <= 9) {
                        let index = cellChoice - 1;
                        let currentMark = xoSession.board[index];
                        if (currentMark === "❌" || currentMark === "⭕") {
                            return await sock.sendMessage(from, { text: `❌ هذا المكان محجوز بالفعل!` }, { quoted: mek });
                        }
                        let playerSymbol = sender === xoSession.players[0] ? "❌" : "⭕";
                        xoSession.board[index] = playerSymbol;

                        const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                        let hasWon = winCombos.some(combo => combo.every(i => xoSession.board[i] === playerSymbol));

                        if (hasWon) {
                            delete global.activeXoSessions[from];
                            const winBoard = `🏆 **انتهت المعركة وفاز البطل!** 🏆\n\n` +
                                `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                `───────────\n` +
                                `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                `───────────\n` +
                                `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                                `🎉 الف مبروك للبطل الفائز @${sender.split('@')[0]}!`;
                            await sock.sendMessage(from, { text: winBoard, mentions: [sender] });
                            return;
                        }

                        xoSession.turn = xoSession.players.find(p => p !== sender);
                        const updateBoard = `🎮 **لعبة XO - اكس اوه** 🎮\n\n` +
                            `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                            `───────────\n` +
                            `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                            `───────────\n` +
                            `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                            `دور اللاعب (@${xoSession.turn.split('@')[0]}) - اختر رقماً:`;
                        await sock.sendMessage(from, { text: updateBoard, mentions: xoSession.players });
                        return;
                    }
                }

                if (mutedUsers[sender] && !isDev) {
                    await sock.sendMessage(from, { delete: mek.key });
                    return;
                }

                if (!isDev && !isBot) {
                    let isOffensive = false;
                    if (body && !body.trim().startsWith('.')) {
                        const lowerBody = body.toLowerCase();
                        if (badWords.some(word => lowerBody.includes(word)) || badEmojis.some(emoji => body.includes(emoji))) {
                            isOffensive = true;
                        }
                    }
                    if (isOffensive) {
                        await sock.sendMessage(from, { delete: mek.key });
                        if (!userWarnings[sender]) userWarnings[sender] = 0;
                        userWarnings[sender] += 1;
                        
                        if (userWarnings[sender] >= 5) {
                            mutedUsers[sender] = true;
                            userWarnings[sender] = 0;
                            await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${sender.split('@')[0]} تلقائياً لتجاوز الإنذارات (5)!`, mentions: [sender] });
                        } else {
                            await sock.sendMessage(from, { text: `⚠️ تنبيه (${userWarnings[sender]}/5) يا @${sender.split('@')[0]}، ممنوع الشتايم!`, mentions: [sender] }, { quoted: mek });
                        }
                        return;
                    }
                }

                userBank[sender].xp += 2;
                if (userBank[sender].xp >= userBank[sender].level * 150 && userBank[sender].level < 10) {
                    userBank[sender].level += 1;
                    await sock.sendMessage(from, { text: `🎉 مبروك يا @${sender.split('@')[0]}، ترقيت للمستوى (${userBank[sender].level})! 👑`, mentions: [sender] });
                }

                const currentLevel = userBank[sender].level;
                const args = body.trim().split(/ +/);
                const command = args.shift().toLowerCase();
                const q = args.join(' ');
                              if (command === '.اوامر' || command === '.الأوامر') {
                    const now = new Date();
                    const time12 = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    const dateGregorian = now.toLocaleDateString('ar-EG', { calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric' });
                    const dateHijri = now.toLocaleDateString('ar-SA-u-ca-islamic', { year: 'numeric', month: 'long', day: 'numeric' });
                    
                    const menuText = 
`╔═══════════════════════════╗
║   👑 **قائمة أوامر بوت جوجو** 👑    ║
╠═══════════════════════════╣
║ 📌 **المطور الأساسي:** مالك
║ ⏰ **الوقت:** ${time12}
║ 📅 **الميلادي:** ${dateGregorian}
║ 🌙 **الهجري:** ${dateHijri}
╠═══════════════════════════╣
║ 📌 **أولاً: الأوامر الأساسية**
║ • \`.اوامر\` - لعرض القائمة الرئيسية
║ • \`.العاب\` - قائمة الألعاب الترفيهية
║ • \`.معلومات [منشن]\` - عرض ملفك أو ملف غيرك
║ • \`.رتبتي\` - معرفة رتبتك ومستواك الحالي
║ • \`.لقبي [اللقب]\` - تعيين أو تغيير لقبك الخاص
║ • \`.بنك\` - رصيدك والكوينز والقلوب
║ • \`.تحويل [المبلغ] [منشن]\` - تحويل أموال
║ • \`.صلاه\` - مواقيت الصلاة بسوهاج
║ • \`.عرض\` - كشف وسائط العرض لمرة واحدة (View Once)
╚═══════════════════════════╝`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.الجاسوس\` - تفعيل لعبة الجاسوس (اكتب .انضم ثم .ابدأ جاسوس)
• \`.اكس اوه\` - فتح حلبة XO (اكتب .انضم اوه)
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: gamesMenu }, { quoted: mek });
                }
                else if (command === '.المطور' || command === '.مطور') {
                    if (!isDev && currentLevel <= 5) return await sock.sendMessage(from, { text: `❌ هذه القائمة للمطور والأعضاء برتبة أعلى من 5 فقط!` }, { quoted: mek });
                    const devMenu = 
`🛠 ──『 **قائمة المطور والإدارة** 』── 🛠
• \`.رتبه [منشن] [رقم الرتبة]\` - تعديل رتبة عضو
• \`.كتم\` - كتم عضو مشاغب (بالمنشن أو الرد) [أعلى من رتبة 5]
• \`.فك كتم\` - إلغاء الكتم عن عضو [أعلى من رتبة 5]
• \`.اضافه ملصق\` - حظر ملصق مسيء
• \`.اضافه ايموجي\` - حظر إيموجي مسيء
• \`.اضافه مطور\` - ترقية مطور جديد
• \`.اضافه أمر [الأمر] | [الرد]\` - إضافة رد مخصص
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: devMenu }, { quoted: mek });
                }
                else if (command === '.معلومات') {
                    const targetUser = getTarget() || sender;
                    const userNickname = userNicknames[targetUser] || 'بدون لقب';
                    const rankTitles = ["مبتدئ", "حارس", "فارس", "نبيل", "أمير", "مستشار", "وزير", "سيد", "ملك", "الحاكم المطلق ⚡"];
                    const targetLevel = userBank[targetUser]?.level || 1;
                    const rTitle = (targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID)) ? "الملك الإمبراطور ⚡" : rankTitles[targetLevel - 1] || "عضو";
                    const bankInfo = userBank[targetUser] || { coins: 200, points: 10, hearts: 3, xp: 0, level: 1 };
                    
                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(targetUser, 'image');
                    } catch {
                        ppUrl = 'https://i.imgur.com/1Z8M1Yx.png';
                    }
                    const infoText = `👑 ──『 **الملف الشخصي** 』── 👑\n│ 🆔 المعرف: @${targetUser.split('@')[0]}\n│ 🏷️ اللقب: ${userNickname}\n│ 🎖️️ الرتبة: ${rTitle} (${targetLevel})\n│ 📈 XP: ${bankInfo.xp}\n│ 💰 الكوينز: ${bankInfo.coins}\n│ ❤️ القلوب: ${bankInfo.hearts}\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { image: { url: ppUrl }, caption: infoText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.تحويل') {
                    const targetUser = getTarget();
                    let amount = parseInt(args[0]);
                    if (!targetUser || isNaN(amount) || amount <= 0) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: .تحويل [المبلغ] (بالمنشن أو الرد على الشخص)` }, { quoted: mek });
                    }
                    if (sender === targetUser) {
                        return await sock.sendMessage(from, { text: `❌ لا يمكنك تحويل أموال لنفسك!` }, { quoted: mek });
                    }
                    if (!userBank[sender]) userBank[sender] = { coins: 200, points: 10, hearts: 3, xp: 0, level: 1 };
                    if (userBank[sender].coins < amount && !isDev) {
                        return await sock.sendMessage(from, { text: `❌ رصيدك الحالي (${userBank[sender].coins} كوينز) لا يكفي!` }, { quoted: mek });
                    }
                    if (!userBank[targetUser]) userBank[targetUser] = { coins: 200, points: 10, hearts: 3, xp: 0, level: 1 };
                    
                    if (!isDev) userBank[sender].coins -= amount;
                    userBank[targetUser].coins += amount;
                    
                    await sock.sendMessage(from, { text: `💸 تم تحويل مبلغ (${amount} كوينز) بنجاح إلى العضو @${targetUser.split('@')[0]}!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.عرض') {
                    if (!mek.message.extendedTextMessage || !mek.message.extendedTextMessage.contextInfo || !mek.message.extendedTextMessage.contextInfo.quotedMessage) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: رد على رسالة "العرض لمرة واحدة" (View Once) بـ .عرض` }, { quoted: mek });
                    }

                    const quotedMsg = mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    let targetMessage = null;
                    
                    if (quotedMsg.viewOnceMessageV2) {
                        targetMessage = quotedMsg.viewOnceMessageV2.message;
                    } else if (quotedMsg.viewOnceMessage) {
                        targetMessage = quotedMsg.viewOnceMessage.message;
                    } else if (quotedMsg.imageMessage && quotedMsg.imageMessage.viewOnce) {
                        targetMessage = { imageMessage: quotedMsg.imageMessage };
                    } else if (quotedMsg.videoMessage && quotedMsg.videoMessage.viewOnce) {
                        targetMessage = { videoMessage: quotedMsg.videoMessage };
                    }

                    if (!targetMessage) {
                        return await sock.sendMessage(from, { text: `❌ هذه الرسالة ليست وسائط "عرض لمرة واحدة"!` }, { quoted: mek });
                    }

                    try {
                        let type = Object.keys(targetMessage)[0];
                        let mediaMsg = targetMessage[type];
                        
                        const stream = await downloadContentFromMessage(mediaMsg, type === 'imageMessage' ? 'image' : 'video');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }

                        let captionText = mediaMsg.caption ? `📌 التوضيح: ${mediaMsg.caption}` : `✨ تم استخراج الوسائط المخفية بنجاح!`;

                        if (type === 'imageMessage') {
                            await sock.sendMessage(from, { image: buffer, caption: captionText }, { quoted: mek });
                        } else if (type === 'videoMessage') {
                            await sock.sendMessage(from, { video: buffer, caption: captionText }, { quoted: mek });
                        }
                    } catch (err) {
                        console.error("خطأ في تحميل وسائط العرض لمرة واحدة:", err);
                        await sock.sendMessage(from, { text: `❌ حدث خطأ أثناء محاولة كشف الوسائط.` }, { quoted: mek });
                    }
                }
                else if (command === '.رتبتي' || command === '.رتب') {
                    const rankTitles = ["مبتدئ", "حارس", "فارس", "نبيل", "أمير", "مستشار", "وزير", "سيد", "ملك", "الحاكم المطلق ⚡"];
                    const rTitle = isDev ? "الملك الإمبراطور ⚡" : rankTitles[currentLevel - 1] || "عضو";
                    await sock.sendMessage(from, { text: `🎖️ رتبتك الحالية: *${rTitle}* (المستوى ${currentLevel})` }, { quoted: mek });
                }
                else if (command === '.لقبي') {
                    if (!q) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .لقبي [اللقب]' }, { quoted: mek });
                    for (let s in userNicknames) {
                        if (userNicknames[s] === q && s !== sender) {
                            return await sock.sendMessage(from, { text: `❌ عذراً، هذا اللقب مستخدم بالفعل من قبل عضو آخر!` }, { quoted: mek });
                        }
                    }
                    if (!userNicknames[sender]) {
                        userNicknames[sender] = q;
                        await sock.sendMessage(from, { text: `✅ تم تعيين لقبك الأول مجاناً: ${q}` }, { quoted: mek });
                    } else {
                        if (userBank[sender].coins < 20) {
                            return await sock.sendMessage(from, { text: `❌ ليس لديك كوينز كافية لتغيير اللقب! التكلفة 20 كوينز.` }, { quoted: mek });
                        }
                        userBank[sender].coins -= 20;
                        userNicknames[sender] = q;
                        await sock.sendMessage(from, { text: `✅ تم تغيير لقبك إلى: ${q}` }, { quoted: mek });
                    }
                }
                else if (command === '.بنك') {
                    const bankInfo = userBank[sender];
                    await sock.sendMessage(from, { text: `🏦 الكوينز: ${bankInfo.coins}\n⭐ النقاط: ${bankInfo.points}\n❤️ القلوب: ${bankInfo.hearts}\n📈 المستوى: ${bankInfo.level}` }, { quoted: mek });
                }
                else if (command === '.الجاسوس') {
                    if (global.activeSpySessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠️ هناك لعبة جاسوس قائمة بالفعل! اكتب **.انضم** للانضمام.` }, { quoted: mek });
                    }
                    global.activeSpySessions[from] = { state: 'waiting_joins', players: [], votes: {} };
                    await sock.sendMessage(from, { text: `🕵‍♂️ **بدأ تسجيل لعبة الجاسوس الملكية!**\nاكتب **.انضم** للانضمام، ثم اكتب **.ابدأ جاسوس** للبدء!` });
                }
                else if (command === '.اكس اوه' || command === '.اكس اوة' || command === 'اكس اوه' || command === 'اكس اوة') {
                    if (global.activeXoSessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠️ حلبة XO قائمة بالفعل! اكتب **.انضم اوه** للانضمام.` });
                    }
                    global.activeXoSessions[from] = { state: 'waiting_joins', players: [sender] };
                    await sock.sendMessage(from, { text: `⚔️ **حلبة XO الملكية** ⚔️\nأنشأ التحدي @${sender.split('@')[0]}!\nعلى الخصم كتابة **.انضم اوه** للمشاركة!`, mentions: [sender] }, { quoted: mek });
                }
                else if (command === '.صلاه' || command === 'صلاه') {
                    try {
                        const response = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=Sohag&country=Egypt&method=5`);
                        const timings = response.data.data.timings;
                        
                        const format12 = (timeStr) => {
                            let [hours, minutes] = timeStr.split(':');
                            let h = parseInt(hours);
                            let ampm = h >= 12 ? 'م' : 'ص';
                            h = h % 12;
                            h = h ? h : 12;
                            return `${h}:${minutes} ${ampm}`;
                        };

                        const salahText = `🕌 **مواقيت الصلاة بتوقيت سوهاج اليوم:**\n` +
                            `• الفجر: ${format12(timings.Fajr)}\n` +
                            `• الشروق: ${format12(timings.Sunrise)}\n` +
                            `• الظهر: ${format12(timings.Dhuhr)}\n` +
                            `• العصر: ${format12(timings.Asr)}\n` +
                            `• المغرب: ${format12(timings.Maghrib)}\n` +
                            `• العشاء: ${format12(timings.Isha)}\n\n✨ تقبل الله طاعتكم!`;
                        await sock.sendMessage(from, { text: salahText }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ حدث خطأ أثناء جلب مواقيت الصلاة.` }, { quoted: mek });
                    }
                }
                else if (command === '.رتبه') {
                    if (!isDev) return await sock.sendMessage(from, { text: `❌ هذا الأمر للمطور فقط!` }, { quoted: mek });
                    const targetUser = getTarget();
                    const newLevelNum = parseInt(args[args.length - 1]);
                    if (!targetUser || isNaN(newLevelNum) || newLevelNum < 1 || newLevelNum > 10) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: .رتبه [منشن الشخص] [رقم الرتبة من 1 إلى 10]` }, { quoted: mek });
                    }
                    if (!userBank[targetUser]) userBank[targetUser] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                    userBank[targetUser].level = newLevelNum;
                    await sock.sendMessage(from, { text: `✅ تم تعديل رتبة العضو @${targetUser.split('@')[0]} إلى المستوى (${newLevelNum}) بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.كتم') {
                    if (!isDev && currentLevel <= 5) {
                        return await sock.sendMessage(from, { text: `❌ أمر الكتم مخصص للرتب الأعلى من 5 والمطور فقط!` }, { quoted: mek });
                    }
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .كتم (بالرد أو المنشن)' }, { quoted: mek });
                    mutedUsers[targetUser] = true;
                    await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.فك كتم') {
                    if (!isDev && currentLevel <= 5) {
                        return await sock.sendMessage(from, { text: `❌ أمر فك الكتم مخصص للرتب الأعلى من 5 والمطور فقط!` }, { quoted: mek });
                    }
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .فك كتم (بالرد أو المنشن)' }, { quoted: mek });
                    delete mutedUsers[targetUser];
                    await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.اضافه ملصق') {
                    if (!isDev && currentLevel <= 5) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة أعلى من 5 أو مطور!` }, { quoted: mek });
                    if (mtype === 'extendedTextMessage' && mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
                        const stickerSha = mek.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage.fileSha256;
                        if (stickerSha) badStickers.push(stickerSha.toString());
                        await sock.sendMessage(from, { text: `✅ تمت إضافة الملصق لقائمة الحظر بنجاح.` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: رد على الملصق بـ .اضافه ملصق` }, { quoted: mek });
                    }
                }
                else if (command === '.اضافه ايموجي') {
                    if (!isDev && currentLevel <= 5) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة أعلى من 5 أو مطور!` }, { quoted: mek });
                    if (!q) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .اضافه ايموجي [الايموجي]' }, { quoted: mek });
                    badEmojis.push(q);
                    await sock.sendMessage(from, { text: `✅ تمت إضافة الإيموجي (${q}) بنجاح.` }, { quoted: mek });
                }
                else if (command === '.اضافه مطور') {
                    if (!isDev) return await sock.sendMessage(from, { text: `❌ هذا الأمر للمطور الأساسي فقط!` }, { quoted: mek });
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: .اضافه مطور (بالرد أو المنشن)` }, { quoted: mek });
                    await sock.sendMessage(from, { text: `✅ تم تعيين العضو @${targetUser.split('@')[0]} كمطور جديد!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.اضافه أمر') {
                    if (!isDev && currentLevel <= 5) return await sock.sendMessage(from, { text: '❌ يتطلب رتبة أعلى من 5 أو مطور.' }, { quoted: mek });
                    const parts = q.split('|');
                    if (parts.length < 2) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .اضافه أمر .الاسم | الرد' }, { quoted: mek });
                    const cmdName = parts[0].trim();
                    const cmdResp = parts[1].trim();
                    customCommands[cmdName] = cmdResp;
                    await sock.sendMessage(from, { text: `✅ تمت إضافة الأمر (*${cmdName}*) بنجاح!` }, { quoted: mek });
                }
                else if (customCommands[command]) {
                    await sock.sendMessage(from, { text: customCommands[command] }, { quoted: mek });
                }

            } catch (error) {
                console.error("خطأ في معالجة الرسالة:", error);
            }
        });
    } catch (err) {
        console.error("خطأ في تشغيل البوت:", err);
    }
}

startGojoBot();
  

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
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

const rankTitles = [
    "عضو", "حامل الراية", "حامل البريق", "الملازم", "الفارس", 
    "مشرف متدرب", "مشرف", "التشيبوكاي", "العميد", "نائب الأدميرال", 
    "الأدميرال", "نائب الدوق", "الدوق", "نائب الجنرال", "الجنرال", 
    "نائب الملك", "الملك", "نائب الإمبراطور", "الإمبراطور"
];

const badWords = [
    "شرموط", "قحبة", "منيوك", "متناك", "خول", "عرص", "كلب", "ابن الكلب", "وسخ", "ابن الوسخة", 
    "منياك", "منيكة", "كس", "طيز", "زب", "قذر", "حقير", "سافل", "حمار", "جحش", "ديوث", "عاهر", 
    "عاهرة", "شمال", "بنت الوسخة", "ابن الحرام", "علق", "زفت", "نجس", "تفو", "امك", "أختك", "احا", "سكس", "نيك", "شرموطة"
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
                const isBot = mek.key.fromMe;

                const body = (mtype === 'conversation') ? mek.message.conversation :
                             (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
                
                if (!userBank[sender]) {
                    userBank[sender] = { cash: isDev ? 1000000 : 50, coins: isDev ? 10000000000 : 200, points: isDev ? 10000000000 : 10, hearts: 3, xp: 0, level: isDev ? 18 : 0 };
                } else {
                    if (isDev) {
                        userBank[sender].coins = 10000000000;
                        userBank[sender].level = 18;
                    }
                    if (userBank[sender].cash === undefined) userBank[sender].cash = 50;
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
                    let mentionedMatch = body.match(/@([0-9]+)/);
                    if (mentionedMatch) {
                        return mentionedMatch[1] + '@s.whatsapp.net';
                    }
                    return null;
                };

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

                    let playersListText = `🕵‍♂ **بدأت لعبة الجاسوس الملكية!**\nالمتنافسون:\n`;
                    spySession.players.forEach((p, idx) => {
                        playersListText += `${idx + 1}️⃣ @${p.split('@')[0]}\n`;
                    });
                    playersListText += `\n📌 اكتب رقم المشتبه به للتصويت (مثال: \`1\`).`;
                    await sock.sendMessage(from, { text: playersListText, mentions: spySession.players });
                    return;
                }

                let xoSession = global.activeXoSessions[from];
                if (xoSession && xoSession.state === 'playing') {
                    let cellChoice = parseInt(body.trim());
                    if (!isNaN(cellChoice) && cellChoice >= 1 && cellChoice <= 9) {
                        if (!xoSession.players.includes(sender)) return; 
                        if (sender !== xoSession.turn) {
                            return await sock.sendMessage(from, { text: `⚠ ليس دورك الآن يا @${sender.split('@')[0]}!`, mentions: [sender] }, { quoted: mek });
                        }
                        
                        let index = cellChoice - 1;
                        if (xoSession.board[index] === "❌" || xoSession.board[index] === "⭕") {
                            return await sock.sendMessage(from, { text: `❌ هذا المكان محجوز بالفعل!` }, { quoted: mek });
                        }
                        let playerSymbol = sender === xoSession.players[0] ? "❌" : "⭕";
                        xoSession.board[index] = playerSymbol;

                        const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                        let hasWon = winCombos.some(combo => combo.every(i => xoSession.board[i] === playerSymbol));

                        if (hasWon) {
                            delete global.activeXoSessions[from];
                            if (!userBank[sender]) userBank[sender] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 0 };
                            userBank[sender].cash += 10;

                            const winBoard = `🏆 **انتهت المعركة وفاز البطل!** 🏆\n\n` +
                                `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                `───────────\n` +
                                `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                `───────────\n` +
                                `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                                `🎉 الف مبروك للبطل الفائز @${sender.split('@')[0]}!\n💰 تم إضافة **10 جنيه** إلى محفظتك الملكية!`;
                            await sock.sendMessage(from, { text: winBoard, mentions: [sender] });
                            return;
                        }

                        if (xoSession.board.every(cell => cell === "❌" || cell === "⭕")) {
                            delete global.activeXoSessions[from];
                            return await sock.sendMessage(from, { text: `🤝 **انتهت اللعبة تعادل بين البطلين!**` });
                        }

                        if (xoSession.isVsBot) {
                            xoSession.turn = sender;
                            let availableCells = [];
                            xoSession.board.forEach((val, idx) => {
                                if (val !== "❌" && val !== "⭕") availableCells.push(idx);
                            });

                            if (availableCells.length > 0) {
                                let botChoiceIndex = availableCells[Math.floor(Math.random() * availableCells.length)];
                                xoSession.board[botChoiceIndex] = "⭕";

                                let botWon = winCombos.some(combo => combo.every(i => xoSession.board[i] === "⭕"));
                                if (botWon) {
                                    delete global.activeXoSessions[from];
                                    const botWinBoard = `🤖 **فاز الذكاء الاصطناعي (البوت)!** 🤖\n\n` +
                                        `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                        `───────────\n` +
                                        `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                        `───────────\n` +
                                        `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}`;
                                    return await sock.sendMessage(from, { text: botWinBoard });
                                }
                            }

                            const updateBoardBot = `🤖 **لعبة XO ضد البوت** 🤖\n\n` +
                                `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                `───────────\n` +
                                `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                `───────────\n` +
                                `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                                `دورك يا @${sender.split('@')[0]} (❌) - اختر رقماً:`;
                            return await sock.sendMessage(from, { text: updateBoardBot, mentions: [sender] });
                        } else {
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
                }
                if (mutedUsers[sender] && !isDev) {
                    await sock.sendMessage(from, { delete: mek.key });
                    return;
                }

                userBank[sender].xp += 2;
                const currentLevel = userBank[sender].level;
                if (userBank[sender].xp >= (currentLevel + 1) * 150 && currentLevel < 18) {
                    userBank[sender].level += 1;
                    await sock.sendMessage(from, { text: `🎉 مبروك يا @${sender.split('@')[0]}، ترقيت لرتبة (${rankTitles[userBank[sender].level]})! 👑`, mentions: [sender] });
                }

                const args = body.trim().split(/ +/);
                const command = args.shift().toLowerCase();
                const q = args.join(' ');

                if (command === '.اوامر' || command === '.الأوامر') {
                    const now = new Date();
                    const time12 = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    
                    const menuText = 
`╔═══════════════════════════╗
║   👑 **قائمة أوامر بوت جوجو** 👑    ║
╠═══════════════════════════╣
║ 📌 **المطور:** مالك | ⏰ ${time12}
╠═══════════════════════════╣
║ 📌 **الأوامر العامة والترفيهية:**
║ • \`.اوامر\` - القائمة الرئيسية
║ • \`.العاب\` - الألعاب الترفيهية (جائزة 10 ج للفائز)
║ • \`.حاله\` - عرض حالتك الصحيحة بالرتبة والمحفظة
║ • \`.بنك [منشن]\` - معرفة رصيد البنك والمحفظة
║ • \`.زواج\` - اختيار عشوائي للزواج (مع ميزة المطور)
║ • \`.طلاق\` - اختيار عشوائي للطلاق بطريقة ساخرة
║ • \`.معلومات [منشن]\` - عرض الملف الشخصي
║ • \`.رتبتي\` - معرفة رتبتك الحالية
║ • \`.لقبي [اللقب]\` - تعيين لقبك
║ • \`.تحويل [المبلغ] [منشن]\` - تحويل أموال
║ • \`.منشن [منشن]\` - إرسال 10 تنبيهات
║ • \`.مكالمه [منشن]\` - تنبيه خاص
║ • \`.كتم / فك كتم\` - للإدارة [رتبة 8+]
║ • \`.إنهاء\` - لإنهاء الألعاب [رتبة 8+]
╚═══════════════════════════╝`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.الجاسوس\` - لعبة الجاسوس (الفائز يكسب 10 ج)
• \`.اكس اوه\` - ضد البوت (الفائز يكسب 10 ج)
• \`.اكس اوه [منشن]\` - تحدي صديق (الفائز يكسب 10 ج)
• \`.إنهاء\` - لإنهاء الألعاب النشطة [إدارة]
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: gamesMenu }, { quoted: mek });
                }
                else if (command === '.حاله' || command === '.حالة') {
                    const targetUser = getTarget() || sender;
                    const uName = targetUser.split('@')[0];
                    const uNick = userNicknames[targetUser] || 'بدون لقب';
                    const uBank = userBank[targetUser] || { cash: 50, coins: 200, points: 10, xp: 0, level: 0 };
                    
                    const isTargetDev = targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID) || targetUser.includes(BOT_PHONE);
                    const uRankName = isTargetDev ? "الإمبراطور ⚡" : rankTitles[uBank.level] || "عضو";

                    const statusText = `╭━━━〔 📊 حـالـتـك 〕━━━╮\n\n👤 الاسم: @${uName}\n🏷 اللقب: ${uNick}\n💰 المحفظة: ${uBank.cash} ج\n🏦 البنك: ${uBank.coins}\n⭐ XP: ${uBank.xp}\n📈 المستوى: ${uBank.level}\n👑 الرتبة: ${uRankName}\n\n╰━━━━━━━━━━━━━━━━━━━━╯`;
                    await sock.sendMessage(from, { text: statusText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.بنك') {
                    const targetUser = getTarget() || sender;
                    const uBank = userBank[targetUser] || { cash: 50, coins: 200 };
                    const bankText = `🏦 ──『 **صندوق البنك** 』── 🏦\n\n👤 العضو: @${targetUser.split('@')[0]}\n💰 المحفظة (الكاش): ${uBank.cash} جنيه\n🏦 رصيد البنك (الكوينز): ${uBank.coins}\n\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: bankText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.زواج') {
                    try {
                        let groupMetadata = await sock.groupMetadata(from);
                        let participants = groupMetadata.participants.map(p => p.id);
                        if (participants.length < 2) {
                            return await sock.sendMessage(from, { text: `❌ لا يوجد أعضاء كافيون في المجموعة لإجراء الزواج!` }, { quoted: mek });
                        }

                        let p1 = participants[Math.floor(Math.random() * participants.length)];
                        let p2 = participants[Math.floor(Math.random() * participants.length)];
                        while (p2 === p1 && participants.length > 1) {
                            p2 = participants[Math.floor(Math.random() * participants.length)];
                        }

                        if (p2.includes(DEVELOPER_PHONE) || p2.includes(DEVELOPER_ID)) {
                            let temp = p1; p1 = p2; p2 = temp;
                        }

                        const marriageText = `💍 ──『 **مأذون البوت الساخر** 』── 💍\n\n` +
                            `تم بححمد الله عقد قران العريس المبارك:\n🤵 @${p1.split('@')[0]}\n` +
                            `على العروسة السعيدة:\n👰 @${p2.split('@')[0]}\n\n` +
                            `بارب بارك لهما واجمع بينهما في خير (أو في أول خناقة)! 🥂✨`;
                        
                        await sock.sendMessage(from, { text: marriageText, mentions: [p1, p2] }, { quoted: mek });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `❌ هذا الأمر يعمل داخل المجموعات فقط!` }, { quoted: mek });
                    }
                }
                else if (command === '.طلاق') {
                    try {
                        let groupMetadata = await sock.groupMetadata(from);
                        let participants = groupMetadata.participants.map(p => p.id);
                        if (participants.length < 2) {
                            return await sock.sendMessage(from, { text: `❌ لا يوجد أعضاء كافيون لإجراء محكمة الطلاق!` }, { quoted: mek });
                        }

                        let p1 = participants[Math.floor(Math.random() * participants.length)];
                        let p2 = participants[Math.floor(Math.random() * participants.length)];
                        while (p2 === p1 && participants.length > 1) {
                            p2 = participants[Math.floor(Math.random() * participants.length)];
                        }

                        const divorceText = `📜 ──『 **محكمة الأسرة للبوت** 』── 📜\n\n` +
                            `بسبب كثرة حرق اللقيمات وتضييع كوينز البنك، تم إعلان الطلاق الرسمي بالثلاثة بين:\n` +
                            `💔 @${p1.split('@')[0]}\nو\n💔 @${p2.split('@')[0]}\n\n` +
                            `وتم تقسيم نفقة البنك مناصفة! 💸 حظ أوفر في القفص القادم.`;

                        await sock.sendMessage(from, { text: divorceText, mentions: [p1, p2] }, { quoted: mek });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `❌ هذا الأمر يعمل داخل المجموعات فقط!` }, { quoted: mek });
                    }
                }
                else if (command === '.إنهاء' || command === '.انهاء') {
                    if (!isDev && currentLevel < 8) {
                        return await sock.sendMessage(from, { text: `❌ أمر إنهاء الألعاب مخصص لرتبة 8 وأعلى والمطور فقط!` }, { quoted: mek });
                    }

                    let hasActiveGame = false;
                    if (global.activeXoSessions[from]) {
                        delete global.activeXoSessions[from];
                        hasActiveGame = true;
                    }
                    if (global.activeSpySessions[from]) {
                        delete global.activeSpySessions[from];
                        hasActiveGame = true;
                    }

                    if (hasActiveGame) {
                        await sock.sendMessage(from, { text: `🛑 تم إيقاف وإنهاء جميع الألعاب الجارية بواسطة الإدارة @${sender.split('@')[0]}!`, mentions: [sender] }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: `ℹ لا توجد أي ألعاب نشطة حالياً لإنهاؤها.` }, { quoted: mek });
                    }
                }
                else if (command === '.اكس اوه' || command === '.اكس اوة' || command === 'اكس اوه' || command === 'اكس اوة' || body.trim().startsWith('.اكس اوه')) {
                    if (global.activeXoSessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠ حلبة XO قائمة بالفعل! استخدم \`.إنهاء\` لإيقافها.` }, { quoted: mek });
                    }
                    
                    const opponent = getTarget();
                    
                    if (!opponent || opponent === sender) {
                        global.activeXoSessions[from] = {
                            state: 'playing',
                            players: [sender],
                            turn: sender,
                            isVsBot: true,
                            board: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
                        };

                        const botStartBoard = `🤖 **معركة XO ضد البوت (الجائزة 10 ج للفائز)!** 🤖\n\n` +
                            `👤 أنت: ❌ | 🤖 البوت: ⭕\n\n` +
                            `1️⃣ | 2️⃣ | 3️⃣\n───────────\n4️⃣ | 5️⃣ | 6️⃣\n───────────\n7️⃣ | 8️⃣ | 9️⃣\n\n` +
                            `دورك يا @${sender.split('@')[0]}، اختر رقماً (1-9):`;

                        return await sock.sendMessage(from, { text: botStartBoard, mentions: [sender] }, { quoted: mek });
                    }

                    global.activeXoSessions[from] = {
                        state: 'playing',
                        players: [sender, opponent],
                        turn: sender,
                        isVsBot: false,
                        board: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
                    };

                    const startBoard = `⚔ **معركة XO الثنائية (الجائزة 10 ج للفائز)!** ⚔\n\n` +
                        `❌ المهاجم: @${sender.split('@')[0]}\n⭕ المدافع: @${opponent.split('@')[0]}\n\n` +
                        `1️⃣ | 2️⃣ | 3️⃣\n───────────\n4️⃣ | 5️⃣ | 6️⃣\n───────────\n7️⃣ | 8️⃣ | 9️⃣\n\n` +
                        `دور البطل (@${sender.split('@')[0]}) اختر رقماً:`;

                    await sock.sendMessage(from, { text: startBoard, mentions: [sender, opponent] }, { quoted: mek });
                }
                else if (command === '.كتم') {
                    if (!isDev && currentLevel < 8) return await sock.sendMessage(from, { text: `❌ أمر الكتم لرتبة 8 وأعلى والمطور فقط!` }, { quoted: mek });
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة: .كتم [منشن]' }, { quoted: mek });
                    mutedUsers[targetUser] = true;
                    await sock.sendMessage(from, { text: `🔇 تم كتم @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.فك كتم') {
                    if (!isDev && currentLevel < 8) return await sock.sendMessage(from, { text: `❌ أمر فك الكتم لرتبة 8 وأعلى والمطور فقط!` }, { quoted: mek });
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة: .فك كتم [منشن]' }, { quoted: mek });
                    delete mutedUsers[targetUser];
                    await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن @${targetUser.split('@')[0]}!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.منشن') {
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: `❌ الصيغة: .منشن [منشن]` }, { quoted: mek });
                    await sock.sendMessage(from, { text: `🚀 جاري إرسال 10 تنبيهات...` });
                    for (let i = 1; i <= 10; i++) {
                        await sock.sendMessage(from, { text: `🔔 تنبيه (${i}/10) موجه إليك يا @${targetUser.split('@')[0]}!`, mentions: [targetUser] });
                        await delay(1500);
                    }
                }
                else if (command === '.معلومات') {
                    const targetUser = getTarget() || sender;
                    const userNickname = userNicknames[targetUser] || 'بدون لقب';
                    const targetLevel = userBank[targetUser]?.level || 0;
                    const isTargetDev = targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID);
                    const rTitle = isTargetDev ? "الإمبراطور ⚡" : rankTitles[targetLevel] || "عضو";
                    const bankInfo = userBank[targetUser] || { coins: 200, xp: 0 };
                    
                    let ppUrl;
                    try { ppUrl = await sock.profilePictureUrl(targetUser, 'image'); } catch { ppUrl = 'https://i.imgur.com/1Z8M1Yx.png'; }
                    const infoText = `👑 ──『 **الملف الشخصي** 』── 👑\n│ 🆔 المعرف: @${targetUser.split('@')[0]}\n│ 🏷️ اللقب: ${userNickname}\n│ 🎖 الرتبة: ${rTitle}\n│ 📈 المستوى: ${targetLevel}\n│ 💰 البنك: ${bankInfo.coins}\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { image: { url: ppUrl }, caption: infoText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.رتبتي' || command === '.رتبة') {
                    const rTitle = isDev ? "الإمبراطور ⚡" : rankTitles[currentLevel] || "عضو";
                    await sock.sendMessage(from, { text: `🎖️ رتبتك الحالية: *${rTitle}* (المستوى ${currentLevel})` }, { quoted: mek });
                }
                else if (command === '.صلاه' || command === 'صلاه') {
                    try {
                        const response = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=Sohag&country=Egypt&method=5`);
                        const timings = response.data.data.timings;
                        const salahText = `🕌 **مواقيت الصلاة بسوهاج:**\n• الفجر: ${timings.Fajr}\n• الظهر: ${timings.Dhuhr}\n• العصر: ${timings.Asr}\n• المغرب: ${timings.Maghrib}\n• العشاء: ${timings.Isha}`;
                        await sock.sendMessage(from, { text: salahText }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ حدث خطأ أثناء جلب مواقيت الصلاة.` }, { quoted: mek });
                    }
                }
                else if (command === '.رتبه') {
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة 6 وأعلى!` }, { quoted: mek });
                    const targetUser = getTarget();
                    const newLevelNum = parseInt(args[args.length - 1]);
                    if (!targetUser || isNaN(newLevelNum) || newLevelNum < 0 || newLevelNum > 18) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة: .رتبه [منشن] [0-18]` }, { quoted: mek });
                    }
                    if (!userBank[targetUser]) userBank[targetUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 0 };
                    userBank[targetUser].level = newLevelNum;
                    await sock.sendMessage(from, { text: `✅ تم تعديل رتبة العضو @${targetUser.split('@')[0]} إلى (${rankTitles[newLevelNum]}) بنجاح!`, mentions: [targetUser] }, { quoted: mek });
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

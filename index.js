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
                const isBot = mek.key.fromMe || sender.includes(BOT_PHONE);

                const body = (mtype === 'conversation') ? mek.message.conversation :
                             (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
                
                if (!userBank[sender]) {
                    userBank[sender] = { cash: isDev ? 1000000 : 500, coins: isDev ? 10000000000 : 200, points: isDev ? 10000000000 : 10, hearts: 3, xp: 0, level: isDev ? 18 : 0 };
                } else {
                    if (isDev) {
                        userBank[sender].coins = 10000000000;
                        userBank[sender].level = 18;
                    }
                    if (userBank[sender].cash === undefined) userBank[sender].cash = 500;
                }

                global.activeSpySessions = global.activeSpySessions || {};
                global.activeXoSessions = global.activeXoSessions || {};

                // دالة استخراج المنشن الذكية والمحدثة تماماً
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

                    let playersListText = `🕵️‍♂ **بدأت لعبة الجاسوس الملكية!**\nالمتنافسون:\n`;
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

                // محرك لعبة XO المحدث (ضد البوت أو ضد صديق)
                let xoSession = global.activeXoSessions[from];
                if (xoSession && xoSession.state === 'playing' && xoSession.players.includes(sender)) {
                    if (sender !== xoSession.turn) {
                        return await sock.sendMessage(from, { text: `⚠ ليس دورك الآن يا @${sender.split('@')[0]}!`, mentions: [sender] }, { quoted: mek });
                    }
                    let cellChoice = parseInt(body.trim());
                    if (!isNaN(cellChoice) && cellChoice >= 1 && cellChoice <= 9) {
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
║ 📌 **الأوامر العامة والإدارة:**
║ • \`.اوامر\` - القائمة الرئيسية
║ • \`.العاب\` - الألعاب الترفيهية
║ • \`.حاله\` - عرض حالتك الكاملة
║ • \`.معلومات [منشن]\` - عرض ملفك أو ملف غيرك
║ • \`.رتبتي\` - معرفة رتبتك الحالية
║ • \`.لقبي [اللقب]\` - تعيين أو تغيير لقبك
║ • \`.بنك\` - رصيدك والكوينز والقلوب
║ • \`.تحويل [المبلغ] [منشن]\` - تحويل أموال
║ • \`.منشن [منشن]\` - إرسال منشن للشخص 10 مرات
║ • \`.مكالمه [منشن]\` - عمل رنين/تنبيه خاص
║ • \`.كتم [منشن]\` - كتم عضو [رتبة 8 أو أعلى]
║ • \`.فك كتم [منشن]\` - فك الكتم [رتبة 8 أو أعلى]
║ • \`.صلاه\` - مواقيت الصلاة بسوهاج
║ • \`.عرض\` - كشف وسائط العرض لمرة واحدة
╚═══════════════════════════╝`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.الجاسوس\` - لعبة الجاسوس (اكتب .انضم ثم .ابدأ جاسوس)
• \`.اكس اوه\` - العب وحدك ضد البوت (الكمبيوتر)
• \`.اكس اوه [منشن]\` - تحدي صديقك بالمنشن أو الرد
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: gamesMenu }, { quoted: mek });
                }
                else if (command === '.المطور' || command === '.مطور') {
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: `❌ هذه القائمة للمطور ورتبة 6 أو أعلى فقط!` }, { quoted: mek });
                    const devMenu = 
`🛠 ──『 **قائمة المطور والإدارة** 』── 🛠
• \`.رتبه [منشن] [رقم الرتبة 0-18]\` - تعديل رتبة عضو
• \`.اضافه ملصق\` - حظر ملصق مسيء
• \`.اضافه ايموجي\` - حظر إيموجي مسيء
• \`.اضافه مطور\` - ترقية مطور جديد
• \`.اضافه أمر [الأمر] | [الرد]\` - إضافة رد مخصص
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: devMenu }, { quoted: mek });
                }
                else if (command === '.رتب') {
                    const rList = rankTitles.map((r, idx) => `${idx} • ${r}`).join('\n');
                    const ranksText = `╭━━━〔 🏆 الرتب 〕━━━╮\n${rList}\n\n👑 الإدارة:\nرتبة 6 أو أعلى\n\n🔇 الكتم:\nرتبة 8 وأعلى\n╰━━━━━━━━━━━━━━━━━━━━╯`;
                    await sock.sendMessage(from, { text: ranksText }, { quoted: mek });
                }
                else if (command === '.حاله') {
                    const targetUser = getTarget() || sender;
                    const uName = targetUser.split('@')[0];
                    const uNick = userNicknames[targetUser] || 'بدون لقب';
                    const uBank = userBank[targetUser] || { cash: 500, coins: 200, points: 10, xp: 0, level: 0 };
                    const uRankName = isDev ? "الإمبراطور ⚡" : rankTitles[uBank.level] || "عضو";

                    const statusText = `╭━━━〔 📊 حـالـتـك 〕━━━╮\n\n👤 الاسم: @${uName}\n🏷️️ اللقب: ${uNick}\n💰 المحفظة: ${uBank.cash}\n🏦 البنك: ${uBank.coins}\n⭐ XP: ${uBank.xp}\n📈 المستوى: ${uBank.level}\n👑 الرتبة: ${uRankName}\n\n╰━━━━━━━━━━━━━━━━━━━━╯`;
                    await sock.sendMessage(from, { text: statusText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.منشن') {
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: .منشن [بالمنشن أو الرد على الشخص]` }, { quoted: mek });
                    await sock.sendMessage(from, { text: `🚀 جاري إرسال 10 تنبيهات إلى @${targetUser.split('@')[0]}...` });
                    for (let i = 1; i <= 10; i++) {
                        await sock.sendMessage(from, { text: `🔔 تنبيه (${i}/10) موجه إليك يا @${targetUser.split('@')[0]}!`, mentions: [targetUser] });
                        await delay(1500);
                    }
                }
                else if (command === '.مكالمه' || command === '.مكالمة') {
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: .مكالمه [بالمنشن أو الرد على الشخص]` }, { quoted: mek });
                    await sock.sendMessage(from, { text: `📞 جارِ محاولة الاتصال وتنبيه العضو @${targetUser.split('@')[0]} في الخاص...`, mentions: [targetUser] }, { quoted: mek });
                    try {
                        await sock.sendMessage(targetUser, { text: `🚨 تنبيه عاجل! تم استدعاؤك لمكالمة أو تفاعل خاص في الشات بواسطة @${sender.split('@')[0]}`, mentions: [sender] });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `⚠️ تم إرسال التنبيه، لكن يبدو أن خاص العضو مغلق أو يحتاج تفاعل سابق.` });
                    }
                }
                else if (command === '.اكس اوه' || command === '.اكس اوة' || command === 'اكس اوه' || command === 'اكس اوة' || body.trim().includes('اكس اوه')) {
                    if (global.activeXoSessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠ حلبة XO قائمة بالفعل في هذه المحادثة! انتظر انتهاء المعركة الحالية.` }, { quoted: mek });
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

                        const botStartBoard = `🤖 **بدأت معركة XO ضد البوت (الكمبيوتر)!** 🤖\n\n` +
                            `👤 أنت: ❌\n` +
                            `🤖 البوت: ⭕\n\n` +
                            `1️⃣ | 2️⃣ | 3️⃣\n` +
                            `───────────\n` +
                            `4️⃣ | 5️⃣ | 6️⃣\n` +
                            `───────────\n` +
                            `7️⃣ | 8️⃣ | 9️⃣\n\n` +
                            `دورك يا @${sender.split('@')[0]}، اختر رقماً من 1 إلى 9:`;

                        return await sock.sendMessage(from, { text: botStartBoard, mentions: [sender] }, { quoted: mek });
                    }

                    global.activeXoSessions[from] = {
                        state: 'playing',
                        players: [sender, opponent],
                        turn: sender,
                        isVsBot: false,
                        board: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
                    };

                    const startBoard = `⚔ **بدأت معركة XO الملكية!** ⚔️\n\n` +
                        `❌ المهاجم: @${sender.split('@')[0]}\n` +
                        `⭕ المدافع: @${opponent.split('@')[0]}\n\n` +
                        `1️⃣ | 2️⃣ | 3️⃣\n` +
                        `───────────\n` +
                        `4️⃣ | 5️⃣ | 6️⃣\n` +
                        `───────────\n` +
                        `7️⃣ | 8️⃣ | 9️⃣\n\n` +
                        `الدور الآن على البطل (@${sender.split('@')[0]}) اختر رقماً من 1 إلى 9:`;

                    await sock.sendMessage(from, { text: startBoard, mentions: [sender, opponent] }, { quoted: mek });
                }
                else if (command === '.كتم') {
                    if (!isDev && currentLevel < 8) {
                        return await sock.sendMessage(from, { text: `❌ أمر الكتم مخصص لرتبة 8 وأعلى والمطور فقط!` }, { quoted: mek });
                    }
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .كتم (بالرد أو المنشن)' }, { quoted: mek });
                    mutedUsers[targetUser] = true;
                    await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.فك كتم') {
                    if (!isDev && currentLevel < 8) {
                        return await sock.sendMessage(from, { text: `❌ أمر فك الكتم مخصص لرتبة 8 وأعلى والمطور فقط!` }, { quoted: mek });
                    }
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .فك كتم (بالرد أو المنشن)' }, { quoted: mek });
                    delete mutedUsers[targetUser];
                    await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.معلومات') {
                    const targetUser = getTarget() || sender;
                    const userNickname = userNicknames[targetUser] || 'بدون لقب';
                    const targetLevel = userBank[targetUser]?.level || 0;
                    const rTitle = isDev ? "الإمبراطور ⚡" : rankTitles[targetLevel] || "عضو";
                    const bankInfo = userBank[targetUser] || { coins: 200, points: 10, hearts: 3, xp: 0, level: 0 };
                    
                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(targetUser, 'image');
                    } catch {
                        ppUrl = 'https://i.imgur.com/1Z8M1Yx.png';
                    }
                    const infoText = `👑 ──『 **الملف الشخصي** 』── 👑\n│ 🆔 المعرف: @${targetUser.split('@')[0]}\n│ 🏷️ اللقب: ${userNickname}\n│ 🎖 الرتبة: ${rTitle} (${targetLevel})\n│ 📈 XP: ${bankInfo.xp}\n│ 💰 الكوينز: ${bankInfo.coins}\n╰───────────────────────────⬣`;
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
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: `❌ هذا الأمر للمطور أو رتبة 6 وأعلى!` }, { quoted: mek });
                    const targetUser = getTarget();
                    const newLevelNum = parseInt(args[args.length - 1]);
                    if (!targetUser || isNaN(newLevelNum) || newLevelNum < 0 || newLevelNum > 18) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: .رتبه [منشن الشخص] [رقم الرتبة من 0 إلى 18]` }, { quoted: mek });
                    }
                    if (!userBank[targetUser]) userBank[targetUser] = { cash: 500, hearts: 3, coins: 200, points: 10, xp: 0, level: 0 };
                    userBank[targetUser].level = newLevelNum;
                    await sock.sendMessage(from, { text: `✅ تم تعديل رتبة العضو @${targetUser.split('@')[0]} إلى (${rankTitles[newLevelNum]}) بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.اضافه ملصق') {
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة 6 أو أعلى!` }, { quoted: mek });
                    if (mtype === 'extendedTextMessage' && mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
                        const stickerSha = mek.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage.fileSha256;
                        if (stickerSha) badStickers.push(stickerSha.toString());
                        await sock.sendMessage(from, { text: `✅ تمت إضافة الملصق لقائمة الحظر بنجاح.` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: رد على الملصق بـ .اضافه ملصق` }, { quoted: mek });
                    }
                }
                else if (command === '.اضافه ايموجي') {
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة 6 أو أعلى!` }, { quoted: mek });
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
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: '❌ يتطلب رتبة 6 أو أعلى.' }, { quoted: mek });
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

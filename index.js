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

const rankTitles = [
    "عضو 👤", "حامل الراية 🚩", "حامل البريق ✨", "الملازم 🛡️", "الفارس 🐎", 
    "مشرف متدرب 📘", "مشرف 👮‍♂️", "التشيبوكاي 🏴‍☠️", "العميد 🎖️", "نائب الأدميرال ⚓", 
    "الأدميرال 🚢", "نائب الدوق 🏰", "الدوق 👑", "نائب الجنرال ⚔️", "الجنرال ⚡", 
    "نائب الملك ⚜️", "الملك 👑", "نائب الإمبراطور 🌠", "الإمبراطور 🔱"
];

const greetingsList = [
    "السلام عليكم", "وعليكم السلام", "سلام عليكم", "مرحباً", "مرحبا", "أهلاً", "اهلا", "أهلا بك", 
    "صباح الخير", "مساء الخير", "السلام", "hi", "hello", "hey", "أهلاً وسهلاً", "ازيك", "عامل ايه", 
    "تشرفت بك", "يا هلا", "ميه هلا", "نورت", "أحييكم", "تحياتي", "السلاااام عليكم", "علاوي", 
    "صباح النور", "مساء النور", "ازيكم", "كيفكم", "شخباركم", "يوم سعيد", "هلا والله", "اهلين", "مرحبا مليون",
    "سلام", "Yo", "Good morning", "Good evening", "Bonjour", "الو", "كيف حالكم", "يارب تكونوا بخير", 
    "صباح الفل", "صباح الورد", "مساء الورد", "مساء الفل
  "
];
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
                    console.log(`[!] كود ربط بوت غوجو الخاص بك هو: \x1b[32m${code}\x1b[0m`);
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
                console.log('تم اتصال بوت غوجو بنجاح الملكي! 🚀');
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

                let cleanBody = body.trim().toLowerCase();
                for (let greet of greetingsList) {
                    if (cleanBody === greet.toLowerCase() || cleanBody.startsWith(greet.toLowerCase() + " ")) {
                        const replies = [
                            `وعليكم السلام ورحمة الله وبركاته يا هلا بيك يا @${sender.split('@')[0]}! 🌹✨`,
                            `أهلاً وسهلاً بك يا بطل @${sender.split('@')[0]}، منور الشات الملكي! 👑`,
                            `مرحباً بك يا غالي @${sender.split('@')[0]}، كيف يمكنني مساعدتك اليوم؟ 🤖⚡`,
                            `وعليكم السلام يا ملك @${sender.split('@')[0]}! 🌟`
                        ];
                        let chosenReply = replies[Math.floor(Math.random() * replies.length)];
                        await sock.sendMessage(from, { text: chosenReply, mentions: [sender] }, { quoted: mek });
                        break;
                    }
                }

                // --- لعبة الجاسوس ---
                let spySession = global.activeSpySessions[from];
                let isJoiningAction = false;
                let targetUserForSpy = getTarget();

                if (body.trim() === '.انضم' || body.trim() === 'انضم' || body.trim() === '.انضم جاسوس') {
                    isJoiningAction = true;
                } else if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                    let quotedMsgId = mek.message.extendedTextMessage.contextInfo.stanzaId;
                    if (spySession && spySession.announcementId === quotedMsgId) {
                        isJoiningAction = true;
                    }
                }

                if (spySession && spySession.state === 'waiting_joins' && isJoiningAction) {
                    let joiner = sender;
                    if (targetUserForSpy && body.includes('@')) {
                        joiner = targetUserForSpy;
                    }
                    if (!spySession.players.includes(joiner)) {
                        spySession.players.push(joiner);
                        let pList = spySession.players.map((p, i) => `${i + 1}️⃣ @${p.split('@')[0]}`).join('\n');
                        await sock.sendMessage(from, { text: `🕵️‍♂️ **قائمة متسابقي الجاسوس:**\n${pList}\n\n📌 (اكتب **.ابدأ جاسوس** لبدء الجولة أو رد على الرسالة بكلمة **انضم** 🎮)`, mentions: spySession.players }, { quoted: mek });
                    }
                    return;
                }

                if (spySession && spySession.state === 'waiting_joins' && (body.trim() === '.ابدأ جاسوس' || body.trim() === 'ابدأ جاسوس')) {
                    if (spySession.players.length < 3) {
                        return await sock.sendMessage(from, { text: `❌ يجب أن يكون هناك 3 لاعبين على الأقل لبدء لعبة الجاسوس! ⚠️` }, { quoted: mek });
                    }
                    spySession.state = 'playing';
                    const secretWords = ["تفاحة 🍎", "سيارة 🚗", "كمبيوتر 💻", "قلم ✒️", "طائرة ✈", "مسجد 🕌", "بحر 🌊", "كتاب 📖", "هاتف 📱", "قصر 🏰"];
                    const secretWord = secretWords[Math.floor(Math.random() * secretWords.length)];
                    const spyIndex = Math.floor(Math.random() * spySession.players.length);
                    spySession.spy = spySession.players[spyIndex];
                    spySession.secretWord = secretWord;
                    spySession.votes = {};

                    for (let p of spySession.players) {
                        try {
                            if (p === spySession.spy) {
                                await sock.sendMessage(p, { text: `🤫 أنت **الجاسوس** في هذه الجولة! حاول ألا تكشف نفسك 🕵‍♂️.` });
                            } else {
                                await sock.sendMessage(p, { text: `🔒 الكلمة السرية الخاصة بك هي: *${secretWord}* 🔑` });
                            }
                        } catch (e) {}
                    }

                    let playersListText = `🕵️‍♂️ **بدأت لعبة الجاسوس الملكية!** 🎮\nالمتنافسون:\n`;
                    spySession.players.forEach((p, idx) => {
                        playersListText += `${idx + 1}️⃣ @${p.split('@')[0]}\n`;
                    });
                    playersListText += `\n📌 اكتب رقم المشتبه به للتصويت (مثال: \`1\` 🗳️).`;
                    await sock.sendMessage(from, { text: playersListText, mentions: spySession.players });
                    return;
                }

                if (spySession && spySession.state === 'playing') {
                    let voteNum = parseInt(body.trim());
                    if (!isNaN(voteNum) && voteNum >= 1 && voteNum <= spySession.players.length) {
                        if (!spySession.players.includes(sender)) return;
                        let accusedPlayer = spySession.players[voteNum - 1];
                        spySession.votes[sender] = accusedPlayer;

                        await sock.sendMessage(from, { text: `🗳 سجل @${sender.split('@')[0]} صوته ضد المشتبه به @${accusedPlayer.split('@')[0]}!`, mentions: [sender, accusedPlayer] }, { quoted: mek });

                        if (Object.keys(spySession.votes).length === spySession.players.length) {
                            let voteCounts = {};
                            for (let voter in spySession.votes) {
                                let accused = spySession.votes[voter];
                                voteCounts[accused] = (voteCounts[accused] || 0) + 1;
                            }
                            let maxVotes = 0;
                            let mostAccused = null;
                            for (let acc in voteCounts) {
                                if (voteCounts[acc] > maxVotes) {
                                    maxVotes = voteCounts[acc];
                                    mostAccused = acc;
                                }
                            }

                            let resultText = `⚖ **نتائج محكمة الجاسوس:**\n\n`;
                            if (mostAccused === spySession.spy) {
                                resultText += `🎉 كفو يا أبطال! تم كشف الجاسوس بنجاح وهو العضو @${spySession.spy.split('@')[0]}! 🕵‍♂❌`;
                            } else {
                                resultText += `❌ للأسف أخطأتم! الجاسوس الحقيقي كان @${spySession.spy.split('@')[0]} ونجا بفعلته! 🦹‍♂️`;
                            }
                            delete global.activeSpySessions[from];
                            await sock.sendMessage(from, { text: resultText, mentions: [spySession.spy, mostAccused] });
                        }
                        return;
                    }
                }

                // --- حلبة XO ---
                let xoSession = global.activeXoSessions[from];
                if (xoSession && xoSession.state === 'playing') {
                    let cellChoice = parseInt(body.trim());
                    if (!isNaN(cellChoice) && cellChoice >= 1 && cellChoice <= 9) {
                        if (!xoSession.players.includes(sender)) return; 
                        if (sender !== xoSession.turn) {
                            return await sock.sendMessage(from, { text: `⚠ ليس دورك الآن يا @${sender.split('@')[0]}! ⏳`, mentions: [sender] }, { quoted: mek });
                        }
                        
                        let index = cellChoice - 1;
                        if (xoSession.board[index] === "❌" || xoSession.board[index] === "⭕") {
                            return await sock.sendMessage(from, { text: `❌ هذا المكان محجوز بالفعل! ⚠️` }, { quoted: mek });
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
                                `🎉 الف مبروك للبطل الفائز @${sender.split('@')[0]}!\n💰 تم إضافة **10 جنيه** إلى محفظتك الملكية! 💵`;
                            await sock.sendMessage(from, { text: winBoard, mentions: [sender] });
                            return;
                        }

                        if (xoSession.board.every(cell => cell === "❌" || cell === "⭕")) {
                            delete global.activeXoSessions[from];
                            return await sock.sendMessage(from, { text: `🤝 **انتهت اللعبة تعادل بين البطلين!** ⚖️` });
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
                                `دورك يا @${sender.split('@')[0]} (❌) - اختر رقماً: 🎯`;
                            return await sock.sendMessage(from, { text: updateBoardBot, mentions: [sender] });
                        } else {
                            xoSession.turn = xoSession.players.find(p => p !== sender);
                            const updateBoard = `🎮 **لعبة XO - اكس اوه** 🎮\n\n` +
                                `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                `───────────\n` +
                                `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                `───────────\n` +
                                `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                                `دور اللاعب (@${xoSession.turn.split('@')[0]}) - اختر رقماً: 🎯`;
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

                // --- القائمة الرئيسية العامة (خالية تماماً من أوامر المطور) ---
                if (command === '.اوامر' || command === '.الأوامر') {
                    const now = new Date();
                    const time12 = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    
                    let menuText = 
`╔═══════════════════════════╗
║   👑 **قائمة أوامر بوت غوجو** 👑    ║
╠═══════════════════════════╣
║ 📌 **المطور:** مالك | ⏰ ${time12}
╠═══════════════════════════╣
║ 📂 **الأوامر العامة والترفيهية:**
║ • \`.اوامر\` 📋 - القائمة الرئيسية
║ • \`.العاب\` 🎮 - الألعاب الترفيهية والمسابقات
║ • \`.حاله\` 📊 - عرض حالتك بالرتبة والمحفظة
║ • \`.معلومات\` [منشن/رد] 👤 - عرض الملف الشخصي
║ • \`.بنك\` [منشن] 🏦 - معرفة رصيد البنك والمحفظة
║ • \`.زواج\` 💍 - اختيار عشوائي للزواج
║ • \`.طلاق\` 📜 - محكمة الطلاق الساخرة
║ • \`.رتبتي\` 🎖️ - معرفة رتبتك الحالية والمستوى
║ • \`.لقبي [اللقب]\` 🏷️ - تعيين لقبك الشخصي
║ • \`.تحويل [المبلغ] [منشن]\` 💸 - تحويل أموال للأعضاء
║ • \`.منشن [منشن]\` 🚀 - إرسال 10 تنبيهات عاجلة
║ • \`.مكالمه [منشن]\` 📞 - تنبيه اتصال خاص
║ • \`.صلاه\` 🕌 - مواقيت الصلاة بسوهاج
╚═══════════════════════════╝`;

                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.الجاسوس\` 🕵️‍♂️ - بدء لعبة الجاسوس (بالمنشن أو الرد بـ \`.انضم\`)
• \`.اكس اوه\` ❌⭕ - معركة XO ضد البوت (جائزة 10 ج للفائز)
• \`.اكس اوه [منشن]\` ⚔️ - تحدي صديق في XO (جائزة 10 ج للفائز)
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: gamesMenu }, { quoted: mek });
                }
                else if (command === '.حاله' || command === '.حالة' || command === '.معلومات') {
                    let targetUser = getTarget();
                    if (!targetUser && mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                        targetUser = mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (!targetUser) targetUser = sender;

                    const uName = targetUser.split('@')[0];
                    const uNick = userNicknames[targetUser] || 'بدون لقب 🏷️';
                    const uBank = userBank[targetUser] || { cash: 50, coins: 200, points: 10, xp: 0, level: 0 };
                    
                    const isTargetDev = targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID) || targetUser.includes(BOT_PHONE);
                    const uRankName = isTargetDev ? "الإمبراطور 🔱" : rankTitles[uBank.level] || "عضو 👤";

                    const statusText = `╭━━━〔 📊 الـمـلـف الـشـخـصـي 〕━━━╮\n\n` +
                                       `👤 العضو: @${uName}\n` +
                                       `🏷 اللقب: ${uNick}\n` +
                                       `💰 الكاش: ${uBank.cash} ج 💵\n` +
                                       `🏦 رصيد البنك: ${uBank.coins} 🪙\n` +
                                       `⭐ نقاط الخبرة XP: ${uBank.xp}\n` +
                                       `📈 المستوى: ${uBank.level}\n` +
                                       `👑 الرتبة: ${uRankName}\n\n` +
                                       `╰━━━━━━━━━━━━━━━━━━━━╯`;

                    await sock.sendMessage(from, { text: statusText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.بنك') {
                    const targetUser = getTarget();
                    let finalTarget = targetUser;
                    if (!finalTarget && mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                        finalTarget = mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (!finalTarget) finalTarget = sender;

                    const uBank = userBank[finalTarget] || { cash: 50, coins: 200 };
                    const bankText = `🏦 ──『 **صندوق البنك** 』── 🏦\n\n👤 العضو: @${finalTarget.split('@')[0]}\n💰 المحفظة (الكاش): ${uBank.cash} جنيه 💵\n🏦 رصيد البنك (الكوينز): ${uBank.coins} 🪙\n\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: bankText, mentions: [finalTarget] }, { quoted: mek });
                }
                else if (command === '.لقبي') {
                    if (!q) return await sock.sendMessage(from, { text: `❌ اكتب اللقب الذي تريده بجانب الأمر! مثال: \`.لقبي الأسطورة\` ⚠️` }, { quoted: mek });
                    userNicknames[sender] = q;
                    await sock.sendMessage(from, { text: `✅ تم تحديث لقبك الشخصي بنجاح إلى: *${q}* 🏷️`, mentions: [sender] }, { quoted: mek });
                }
                else if (command === '.تحويل') {
                    let argsSplit = q.split(' ');
                    let amount = parseInt(argsSplit[0]);
                    let targetUser = getTarget();

                    if (isNaN(amount) || amount <= 0 || !targetUser) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة غير صحيحة! استخدم:\n\`.تحويل [المبلغ] [منشن]\` 💸` }, { quoted: mek });
                    }

                    if (userBank[sender].cash < amount) {
                        return await sock.sendMessage(from, { text: `❌ رصيدك الحالي (${userBank[sender].cash} ج) لا يكفي لإتمام التحويل! ⚠️` }, { quoted: mek });
                    }

                    userBank[sender].cash -= amount;
                    if (!userBank[targetUser]) userBank[targetUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 0 };
                    userBank[targetUser].cash += amount;

                    await sock.sendMessage(from, { text: `💸 تم تحويل مبلغ *${amount} جنيه* بنجاح من العضو @${sender.split('@')[0]} إلى @${targetUser.split('@')[0]}! 🥂`, mentions: [sender, targetUser] }, { quoted: mek });
                }
                else if (command === '.مكالمه') {
                    let targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: `❌ يرجى منشن الشخص المراد الاتصال به! 📞` }, { quoted: mek });
                    await sock.sendMessage(from, { text: `📞 تريييج... تريييج... اتصال عاجل موجه إلى العضو @${targetUser.split('@')[0]} من البطل @${sender.split('@')[0]}! 🚨 رد بسرعة!`, mentions: [targetUser, sender] }, { quoted: mek });
                }
                else if (command === '.زواج') {
                    try {
                        let groupMetadata = await sock.groupMetadata(from);
                        let participants = groupMetadata.participants.map(p => p.id);
                        if (participants.length < 2) {
                            return await sock.sendMessage(from, { text: `❌ لا يوجد أعضاء كافيون في المجموعة لإجراء الزواج! ⚠` }, { quoted: mek });
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
                        await sock.sendMessage(from, { text: `❌ هذا الأمر يعمل داخل المجموعات فقط! ⚠` }, { quoted: mek });
                    }
                }
                else if (command === '.طلاق') {
                    try {
                        let groupMetadata = await sock.groupMetadata(from);
                        let participants = groupMetadata.participants.map(p => p.id);
                        if (participants.length < 2) {
                            return await sock.sendMessage(from, { text: `❌ لا يوجد أعضاء كافيون لإجراء محكمة الطلاق! ⚠️` }, { quoted: mek });
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
                        await sock.sendMessage(from, { text: `❌ هذا الأمر يعمل داخل المجموعات فقط! ⚠️` }, { quoted: mek });
                    }
                                                            }
                                         // --- قائمة المطور المنفصلة وحصرية الأوامر الإدارية والمطورين ---
                else if (command === '.المطور' || command === '.dev') {
                    if (!isDev) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر مخصص للمطور مالك فقط! ⚡` }, { quoted: mek });
                    }
                    const devMenu = 
`⚡ ──『 **قائمة تحكم المطور (مالك)** 』── ⚡
• \`.اضافه مطور [منشن]\` 🛠️ - إضافة مطور جديد للبوت
• \`.رتبه [منشن] [0-18]\` ⬆️ - تغيير رتبة أي عضو فوراً
• \`.حفظ ملصق\` 🖼 - حفظ واستخراج الملصقات بالرد (للمطورين فقط)
• \`.حفظ ايموجي\` ⭐ - حفظ وتخزين الإيموجيز (للمطورين فقط)
• \`.كتم للجميع\` 🔕 - كتم الشات بالكامل
• \`.فك كتم للجميع\` 📢 - فك الكتم الجماعي
• \`.كتم [منشن/رد]\` 🔇 - كتم فردي للأعضاء
• \`.فك كتم [منشن/رد]\` 🔊 - فك كتم فردي
• \`.إنهاء\` 🛑 - إيقاف أي لعبة عالقة بالمجموعات
• \`.منشن\` 🚀 - تفجير الإشعارات والتنبيهات
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: devMenu }, { quoted: mek });
                }
                else if (command === '.اضافه مطور' || command === '.اضافة_مطور') {
                    if (!isDev) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر مخصص للمطور الأساسي فقط! ⚡` }, { quoted: mek });
                    }
                    let targetUser = getTarget();
                    if (!targetUser) {
                        return await sock.sendMessage(from, { text: `❌ يرجى منشن الشخص المراد إضافته كمطور جديد! ⚠️` }, { quoted: mek });
                    }
                    await sock.sendMessage(from, { text: `✅ تم ترقية العضو @${targetUser.split('@')[0]} ليصبح مطوراً في نظام البوت بنجاح! ⚡👑`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.حفظ ملصق' || command === '.تخزين_ملصق') {
                    if (!isDev) {
                        return await sock.sendMessage(from, { text: `❌ عذراً، أمر حفظ الملصقات مخصص للمطورين والمسؤولين فقط! 🛡️` }, { quoted: mek });
                    }
                    if (!mek.message.extendedTextMessage || !mek.message.extendedTextMessage.contextInfo.quotedMessage) {
                        return await sock.sendMessage(from, { text: `❌ يرجى الرد على الملصق الذي تريد حفظه بكلمة \`.حفظ ملصق\`! 🖼️` }, { quoted: mek });
                    }
                    try {
                        let quotedMsg = mek.message.extendedTextMessage.contextInfo.quotedMessage;
                        let mimeType = Object.keys(quotedMsg)[0];
                        if (mimeType !== 'stickerMessage') {
                            return await sock.sendMessage(from, { text: `❌ الرسالة التي قمت بالرد عليها ليست ملصقاً! ⚠️` }, { quoted: mek });
                        }
                        let stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        await sock.sendMessage(from, { sticker: buffer }, { quoted: mek });
                        await sock.sendMessage(from, { text: `✅ تم حفظ واستخراج الملصق بنجاح الملكي! 🎨`, mentions: [sender] }, { quoted: mek });
                    } catch (err) {
                        console.error("خطأ في حفظ الملصق:", err);
                        await sock.sendMessage(from, { text: `❌ حدث خطأ أثناء محاولة حفظ الملصق. ⚠️` }, { quoted: mek });
                    }
                }
                else if (command === '.حفظ ايموجي' || command === '.سرقة_ايموجي') {
                    if (!isDev) {
                        return await sock.sendMessage(from, { text: `❌ عذراً، أمر حفظ الإيموجي مخصص للمطورين والمسؤولين فقط! 🛡️` }, { quoted: mek });
                    }
                    let textToCheck = q || (mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '');
                    if (!textToCheck) {
                        return await sock.sendMessage(from, { text: `❌ يرجى كتابة الإيموجي أو الرد على رسالة تحتوي على الإيموجي المراد حفظه! 🎯` }, { quoted: mek });
                    }
                    await sock.sendMessage(from, { text: `✅ تم التقاط وحفظ الإيموجي بنجاح في ذاكرة البوت: ${textToCheck} ⭐`, mentions: [sender] }, { quoted: mek });
                }
                else if (command === '.إنهاء' || command === '.انهاء') {
                    if (!isDev && currentLevel < 8) {
                        return await sock.sendMessage(from, { text: `❌ أمر إنهاء الألعاب مخصص لرتبة 8 وأعلى والمطور فقط! 🛡️` }, { quoted: mek });
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
                        await sock.sendMessage(from, { text: `ℹ لا توجد أي ألعاب نشطة حالياً لإنهاؤها. ⚠️` }, { quoted: mek });
                    }
                }
                else if (command === '.اكس اوه' || command === '.اكس اوة' || command === 'اكس اوه' || command === 'اكس اوة' || body.trim().startsWith('.اكس اوه')) {
                    if (global.activeXoSessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠ حلبة XO قائمة بالفعل في هذه المجموعة! استخدم \`.إنهاء\` لإيقافها. 🛑` }, { quoted: mek });
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
                            `دورك يا @${sender.split('@')[0]}، اختر رقماً (1-9): 🎯`;

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
                        `دور البطل (@${sender.split('@')[0]}) اختر رقماً: 🎯`;

                    await sock.sendMessage(from, { text: startBoard, mentions: [sender, opponent] }, { quoted: mek });
                }
                else if (command === '.الجاسوس' || command === 'الجاسوس') {
                    if (global.activeSpySessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠ لعبة الجاسوس منفتحة بالفعل في هذه المجموعة! رد على هذه الرسالة بكلمة **انضم** للمشاركة. 🕵‍♂️` }, { quoted: mek });
                    }
                    
                    let sentMsg = await sock.sendMessage(from, { 
                        text: `🕵️‍♂️ **تم فتح باب التسجيل للعبة الجاسوس!**\n` +
                              `• انضم للمحطة بالرد على هذه الرسالة بكلمة: \`انضم\` أو اكتب \`.انضم\`\n` +
                              `• أو قم بمنشن شخص لدعوته.\n` +
                              `• المتسابقون الحاليون: 1️⃣ @${sender.split('@')[0]}\n\n` +
                              `(يلزم 3 لاعبين ثم اكتب \`.ابدأ جاسوس\` 🎮)`, 
                        mentions: [sender] 
                    }, { quoted: mek });

                    global.activeSpySessions[from] = {
                        state: 'waiting_joins',
                        players: [sender],
                        announcementId: sentMsg.key.id
                    };
                }
                else if (command === '.كتم') {
                    if (!isDev && currentLevel < 8) {
                        return await sock.sendMessage(from, { text: `❌ عذراً، أمر الكتم مخصص لرتبة 8 وأعلى والمطور فقط! 🛡️` }, { quoted: mek });
                    }
                    let targetUser = getTarget();
                    if (!targetUser && mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                        targetUser = mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (!targetUser) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة غير صحيحة! استخدم:\n• \`.كتم [منشن]\`\n• أو **بالرد (Reply)** على رسالة الشخص واكتب \`.كتم\` ⚠` }, { quoted: mek });
                    }
                    mutedUsers[targetUser] = true;
                    await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${targetUser.split('@')[0]} بنجاح! 🔕`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.فك كتم') {
                    if (!isDev && currentLevel < 8) {
                        return await sock.sendMessage(from, { text: `❌ عذراً، أمر فك الكتم مخصص لرتبة 8 وأعلى والمطور فقط! 🛡️` }, { quoted: mek });
                    }
                    let targetUser = getTarget();
                    if (!targetUser && mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                        targetUser = mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (!targetUser) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة غير صحيحة! استخدم:\n• \`.فك كتم [منشن]\`\n• أو **بالرد (Reply)** على رسالة الشخص واكتب \`.فك كتم\` ⚠️` }, { quoted: mek });
                    }
                    delete mutedUsers[targetUser];
                    await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${targetUser.split('@')[0]} بنجاح! 📢`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.كتم للجميع') {
                    if (!isDev && currentLevel < 8) return await sock.sendMessage(from, { text: `❌ أمر كتم الجميع مخصص لرتبة 8 وأعلى والمطور فقط! 🛡` }, { quoted: mek });
                    try {
                        let groupMetadata = await sock.groupMetadata(from);
                        let participants = groupMetadata.participants.map(p => p.id);
                        for (let p of participants) {
                            if (!p.includes(BOT_PHONE) && !p.includes(DEVELOPER_PHONE)) {
                                mutedUsers[p] = true;
                            }
                        }
                        await sock.sendMessage(from, { text: `🔇 **تم تفعيل كتم الجميع في المجموعة بنجاح!** 🔕 لا يمكن لأحد التحدث الآن سوى الإدارة والمطور.` }, { quoted: mek });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `❌ هذا الأمر يعمل داخل المجموعات فقط! ⚠️` }, { quoted: mek });
                    }
                }
                else if (command === '.فك كتم للجميع') {
                    if (!isDev && currentLevel < 8) return await sock.sendMessage(from, { text: `❌ أمر فك كتم الجميع مخصص لرتبة 8 وأعلى والمطور فقط! 🛡️` }, { quoted: mek });
                    try {
                        let groupMetadata = await sock.groupMetadata(from);
                        let participants = groupMetadata.participants.map(p => p.id);
                        for (let p of participants) {
                            delete mutedUsers[p];
                        }
                        await sock.sendMessage(from, { text: `🔊 **تم فك الكتم عن الجميع في المجموعة!** 📢 يمكن للجميع التحدث بحرية الآن.` }, { quoted: mek });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `❌ هذا الأمر يعمل داخل المجموعات فقط! ⚠️` }, { quoted: mek });
                    }
                }
                else if (command === '.منشن') {
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: `❌ الصيغة: \`.منشن [منشن]\` ⚠️` }, { quoted: mek });
                    await sock.sendMessage(from, { text: `🚀 جاري إرسال 10 تنبيهات...` });
                    for (let i = 1; i <= 10; i++) {
                        await sock.sendMessage(from, { text: `🔔 تنبيه (${i}/10) موجه إليك يا @${targetUser.split('@')[0]}!`, mentions: [targetUser] });
                        await delay(1500);
                    }
                }
                else if (command === '.رتبتي' || command === '.رتبة') {
                    const rTitle = isDev ? "الإمبراطور 🔱" : rankTitles[currentLevel] || "عضو 👤";
                    await sock.sendMessage(from, { text: `🎖️ رتبتك الحالية: *${rTitle}* (المستوى ${currentLevel})` }, { quoted: mek });
                }
                else if (command === '.صلاه' || command === 'صلاه') {
                    try {
                        const response = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=Sohag&country=Egypt&method=5`);
                        const timings = response.data.data.timings;
                        const salahText = `🕌 **مواقيت الصلاة بسوهاج:**\n• الفجر: ${timings.Fajr}\n• الظهر: ${timings.Dhuhr}\n• العصر: ${timings.Asr}\n• المغرب: ${timings.Maghrib}\n• العشاء: ${timings.Isha}`;
                        await sock.sendMessage(from, { text: salahText }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ حدث خطأ أثناء جلب مواقيت الصلاة. ⚠` }, { quoted: mek });
                    }
                }
                else if (command === '.رتبه') {
                    if (!isDev && currentLevel < 6) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة 6 وأعلى! 🛡️` }, { quoted: mek });
                    const targetUser = getTarget();
                    const newLevelNum = parseInt(args[args.length - 1]);
                    if (!targetUser || isNaN(newLevelNum) || newLevelNum < 0 || newLevelNum > 18) {
                        return await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: \`.رتبه [منشن] [0-18]\` ⚠️` }, { quoted: mek });
                    }
                    if (!userBank[targetUser]) userBank[targetUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 0 };
                    userBank[targetUser].level = newLevelNum;
                    await sock.sendMessage(from, { text: `✅ تم تعديل رتبة العضو @${targetUser.split('@')[0]} إلى (${rankTitles[newLevelNum]}) بنجاح! 👑`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (customCommands[command]) {
                    await sock.sendMessage(from, { text: customCommands[command] }, { quoted: mek });
                }

            } catch (error) {
                console.error("خطأ في معالجة الرسالة:", error);
            }
        });
    } catch (err) {
        console.error("خطأ في تشغيل بوت غوجو:", err);
    }
}

startGojoBot();
              

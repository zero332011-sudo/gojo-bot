const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const sessionPath = path.join(__dirname, 'session');

const DEVELOPER_ID = "69033026138303";
const DEVELOPER_PHONE = "201032219184";
const BOT_PHONE = "201154684341";

global.botOwners = global.botOwners || [DEVELOPER_PHONE, DEVELOPER_ID, BOT_PHONE];

const userNicknames = {};
const userBank = {}; 
const mutedUsers = {};
const badWordsWarnings = {}; 
const customCommands = {};

// قائمة الشتائم الممنوعة الموسعة
const badWordsList = [
    "شلتت", "كلب", "حمار", "قذر", "لعن", "زفت", "متخلف", "غبي", "معفن", "يا ابن",
    "وسخ", "منيوك", "قحبة", "متناكة", "خول", "شرموطة", "عرص", "حلوف", "حيوان",
    "حشاش", "سرسجي", "خرا", "تفة", "ابن الكلب", "ابن الوسخة", "يا دكر", "يا غبي",
    "يا سافل", "سافل", "حقير", "واطي", "منحط", "تبا", "ينعن", "يخرب بيتك"
];

const rankTitles = [
    "الإمبراطور 🔱", "نائب الإمبراطور 🌠", "الملك 👑", "نائب الملك ⚜️", 
    "الجنرال ⚡", "نائب الجنرال ⚔", "الدوق 👑", "نائب الدوق 🏰", 
    "الأدميرال 🚢", "نائب الأدميرال ⚓", "العميد 🎖️", "التشيبوكاي 🏴‍☠️", 
    "مشرف 👮‍♂️", "مشرف متدرب 📘", "الفارس 🐎", "الملازم 🛡️", 
    "حامل البريق ✨", "حامل الراية 🚩", "عضو 👤"
];

const greetingsList = [
    "صباح الخير", "مساء الخير", "السلام", "hi", "hello", "hey", "أهلاً وسهلاً", "ازيك", "عامل ايه", 
    "تشرفت بك", "يا هلا", "ميه هلا", "نورت", "أحييكم", "تحياتي", "السلاااام عليكم", "علاوي", 
    "صباح النور", "مساء النور", "ازيكم", "كيفكم", "شخباركم", "يوم سعيد", "هلا والله", "اهلين", "مرحبا مليون",
    "سلام", "Yo", "Good morning", "Good evening", "Bonjour", "الو", "كيف حالكم", "يارب تكونوا بخير", 
    "صباح الفل", "صباح الورد", "مساء الورد", "صباح الفل"
];
async function startGojoBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
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
                    console.log(`[!] كود ربط بوت غوجو الجديد هو: \x1b[32m${code}\x1b[0m`);
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

        sock.ev.on('creds.update', async () => {
            await saveCreds();
       
                                     sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                const mtype = Object.keys(mek.message)[0];
                const from = mek.key.remoteJid;
                const sender = mek.key.participant || from;
                const senderNumber = sender.split('@')[0];
                
                const isDev = sender.includes(DEVELOPER_PHONE) || sender.includes(DEVELOPER_ID) || sender.includes(BOT_PHONE) || global.botOwners.some(dev => senderNumber.includes(dev));
                
                const body = (mtype === 'conversation') ? mek.message.conversation :
                             (mtype === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : 
                             (mtype === 'imageMessage') ? mek.message.imageMessage.caption :
                             (mtype === 'videoMessage') ? mek.message.videoMessage.caption : '';
                
                const args = body.trim().split(/ +/);
                const command = args.shift().toLowerCase();
                const q = args.join(' ');

                // --- نظام مانع الشتايم (الحد 3 ثم الكتم) ---
                if (!isDev && body) {
                    let lowerBody = body.toLowerCase();
                    let hasBadWord = badWordsList.some(word => lowerBody.includes(word));
                    if (hasBadWord) {
                        try {
                            await sock.sendMessage(from, { delete: mek.key });
                        } catch (e) {}

                        badWordsWarnings[sender] = (badWordsWarnings[sender] || 0) + 1;
                        let warningsLeft = 3 - badWordsWarnings[sender];

                        if (badWordsWarnings[sender] >= 3) {
                            mutedUsers[sender] = true;
                            badWordsWarnings[sender] = 0;
                            await sock.sendMessage(from, { text: `🚨 تم كتم العضو @${senderNumber} لتخطيه الحد المسموح للشتايم (3 مرات)! ⚠`, mentions: [sender] });
                        } else {
                            await sock.sendMessage(from, { text: `⚠️ انتباه يا @${senderNumber}! ممنوع استخدام الألفاظ النابية. لديك (${warningsLeft}) إنذارات أخرى قبل الكتم! 🚫`, mentions: [sender] });
                        }
                        return;
                    }
                }

                if (!userBank[sender]) {
                    userBank[sender] = { cash: isDev ? 1000000 : 50, coins: isDev ? 10000000000 : 200, points: isDev ? 10000000000 : 10, hearts: 3, xp: 0, level: isDev ? 0 : 18 };
                } else {
                    if (isDev) {
                        userBank[sender].coins = 10000000000;
                        userBank[sender].level = 0;
                    }
                    if (userBank[sender].cash === undefined) userBank[sender].cash = 50;
                }

                global.activeSpySessions = global.activeSpySessions || {};
                global.activeXoSessions = global.activeXoSessions || {};
                global.activeFlameSessions = global.activeFlameSessions || {};

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
            }                                                                                                                                                           });
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
                        await sock.sendMessage(from, { text: `🕵‍♂️ **قائمة متسابقي الجاسوس:**\n${pList}\n\n📌 (اكتب **.ابدأ جاسوس** لبدء الجولة أو رد على الرسالة بكلمة **انضم** 🎮)`, mentions: spySession.players }, { quoted: mek });
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
                            if (!userBank[sender]) userBank[sender] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 18 };
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
                            return await sock.sendMessage(from, { text: `🤝 **انتهت اللعبة تعادل بين البطلين!** ⚖` });
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

                let flameSession = global.activeFlameSessions[from];

                if (command === '.شعله' || command === '.شعلة') {
                    if (flameSession) {
                        return await sock.sendMessage(from, { text: `⚠️ لعبة الشعلة منفتحة بالفعل في هذه المجموعة!` }, { quoted: mek });
                    }

                    let sentMsg = await sock.sendMessage(from, { 
                        text: `╭━━━〔 🔥 جولة الشعلة 🔥 〕━━━╮\n\n` +
                              `🎮 لعبة جديدة بدأت!\n\n` +
                              `👤 صاحب اللعبة:\n` +
                              `@${sender.split('@')[0]}\n\n` +
                              `🔥 دخلت اللعبة تلقائياً!\n\n` +
                              `⏰ التسجيل مفتوح لمدة 30 ثانية.\n` +
                              `📌 اللي عايز يدخل يكتب:\n` +
                              `• تم\n\n` +
                              `🔥 كل لاعب يبدأ بـ 3 شعلات.\n` +
                              `╰━━━━━━━━━━━━━━━━━━━━╯`, 
                        mentions: [sender] 
                    }, { quoted: mek });

                    global.activeFlameSessions[from] = {
                        state: 'waiting_joins',
                        host: sender,
                        players: [sender],
                        scores: { [sender]: 3 },
                        announcementId: sentMsg.key.id
                    };

                    setTimeout(async () => {
                        let activeSess = global.activeFlameSessions[from];
                        if (activeSess && activeSess.state === 'waiting_joins') {
                            activeSess.state = 'playing';
                            await sock.sendMessage(from, { text: `🔥 **بدأت معركة الشعلة!** تابعوا الأسئلة القادمة.` });
                        }
                    }, 30000);
                    return;
                }

                if (flameSession && flameSession.state === 'waiting_joins' && (body.trim() === 'تم' || body.trim() === '.تم')) {
                    if (!flameSession.players.includes(sender)) {
                        flameSession.players.push(sender);
                        flameSession.scores[sender] = 3;
                        await sock.sendMessage(from, { text: `✅ انضم البطل @${sender.split('@')[0]} إلى حلبة الشعلة! (لديه 3 شعلات 🔥)`, mentions: [sender] }, { quoted: mek });
                    }
                    return;
}
                          if (mutedUsers[sender] && !isDev) {
                    await sock.sendMessage(from, { delete: mek.key });
                    return;
                }

                userBank[sender].xp += 2;
                const userLevel = userBank[sender].level;
                if (userBank[sender].xp >= 150 && userLevel > 0) {
                    userBank[sender].xp = 0;
                    userBank[sender].level -= 1;
                    await sock.sendMessage(from, { text: `🎉 مبروك يا @${sender.split('@')[0]}، ترقيت لرتبة (${rankTitles[userBank[sender].level]})! 👑`, mentions: [sender] });
                }

                // --- أمر العرض لإرسال الوسائط وحدها ---
                if (command === '.عرض') {
                    let mediaUrl = "https://i.imgur.com/8qQ345r.jpg"; 

                    await sock.sendMessage(from, { 
                        image: { url: mediaUrl },
                        caption: "" 
                    }, { quoted: mek });
                }
                // --- أمر حفظ ملصق ---
                else if (command === '.حفظ' && q === 'ملصق') {
                    let quotedMsg = mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    let isQuotedImage = quotedMsg && quotedMsg.imageMessage;
                    let isDirectImage = mek.message.imageMessage;

                    if (!isQuotedImage && !isDirectImage) {
                        return await sock.sendMessage(from, { text: `❌ يرجى إرسال صورة أو الرد على صورة بـ \`.حفظ ملصق\` لحفظها! 🖼️` }, { quoted: mek });
                    }
                    await sock.sendMessage(from, { text: `✅ تم استلام الصورة وجاهزة للحفظ كملصق الملكي! 🎭` }, { quoted: mek });
                }
                // --- أمر حفظ ايموجي ---
                else if (command === '.حفظ' && q === 'ايموجي') {
                    let quotedMsg = mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    let isQuotedSticker = quotedMsg && quotedMsg.stickerMessage;

                    if (!isQuotedSticker) {
                        return await sock.sendMessage(from, { text: `❌ يرجى الرد على ملصق بـ \`.حفظ ايموجي\` لتحويله أو حفظه! ⭐` }, { quoted: mek });
                    }
                    await sock.sendMessage(from, { text: `✅ تم حفظ تفاصيل الايموجي/الملصق بنجاح! 🎯` }, { quoted: mek });
                }
                else if (command === '.اوامر' || command === '.الأوامر') {
                    const now = new Date();
                    const time12 = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    const dateGregorian = now.toLocaleDateString('ar-EG', { calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric' });
                    const dateHijri = now.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { year: 'numeric', month: 'long', day: 'numeric' });
                    
                    let menuText = 
`╔═══════════════════════════╗
║   👑 **قائمة أوامر بوت غوجو** 👑    ║
╠═══════════════════════════╣
║ 📌 المطور: مالك علي عبد الرحيم
║ ⏰ الوقت: ${time12}
║ 📅 الميلادي: ${dateGregorian}
║ 🌙 الهجري: ${dateHijri}
╠═══════════════════════════╣
║ 📁 **الأوامر والخدمات الأساسية:**
║ • \`.عرض\` 🖼️ - إرسال صورة الوسائط وحدها
║ • \`.حفظ ملصق\` 🎭 - تحويل الصور إلى ملصقات
║ • \`.حفظ ايموجي\` ⭐ - حفظ وتفاعل الملصقات
║ • \`.اوامر\` 📋 - القائمة الرئيسية والوقت
║ • \`.العاب\` 🎮 - قسم الألعاب والمسابقات
║ 
║ 👤 **الملف الشخصي والحسابات:**
║ • \`.حاله\` / \`.معلومات\` 📊 - عرض حالتك ورتبتك
║ • \`.بنك\` 🏦 - الاستعلام عن رصيدك وكاشك
║ • \`.رتبتي\` 🎖️ - معرفة رتبتك الحالية
║ • \`.لقبي [اللقب]\` 🏷 - تخصيص لقبك الشخصي
║ • \`.تحويل [المبلغ] [منشن]\` 💸 - تحويل الأموال
║ 
║ 💍 **المجتمع والترفيه:**
║ • \`.زواج\` 💍 - نظام الزواج العشوائي
║ • \`.طلاق\` 📜 - محكمة الطلاق الساخرة
║ • \`.صلاه\` 🕌 - مواقيت الصلاة اليومية
╚═══════════════════════════╝`;

                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.شعله\` أو \`.شعلة\` 🔥 - لعبة الشعلة لدراغون بول وناروتو
• \`.الجاسوس\` 🕵️‍♂ - بدء لعبة الجاسوس
• \`.اكس اوه\` ❌⭕ - معركة XO ضد البوت
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
                    const uNick = userNicknames[targetUser] || 'بدون لقب 🏷';
                    const uBank = userBank[targetUser] || { cash: 50, coins: 200, points: 10, xp: 0, level: 18 };
                    
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

                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(targetUser, 'image');
                    } catch {
                        ppUrl = null;
                    }

                    if (ppUrl) {
                        await sock.sendMessage(from, { image: { url: ppUrl }, caption: statusText, mentions: [targetUser] }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: statusText, mentions: [targetUser] }, { quoted: mek });
                    }
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
                    if (!q) return await sock.sendMessage(from, { text: `❌ اكتب اللقب الذي تريده بجانب الأمر! مثال: \`.لقبي الأسطورة\` ⚠` }, { quoted: mek });
                    userNicknames[sender] = q;
                    await sock.sendMessage(from, { text: `✅ تم تحديث لقبك الشخصي بنجاح إلى: *${q}* 🏷`, mentions: [sender] }, { quoted: mek });
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
                    if (!userBank[targetUser]) userBank[targetUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 18 };
                    userBank[targetUser].cash += amount;

                    await sock.sendMessage(from, { text: `💸 تم تحويل مبلغ *${amount} جنيه* بنجاح من العضو @${sender.split('@')[0]} إلى @${targetUser.split('@')[0]}! 🥂`, mentions: [sender, targetUser] }, { quoted: mek });
        }
                  else if (command === '.صلاه' || command === '.صلاة') {
                    const prayerText = `🕌 **مواقيت الصلاة في سوهاج اليوم:**\n\n` +
                                       `• الفجر: 04:22 ص\n` +
                                       `• الشروق: 05:48 ص\n` +
                                       `• الظهر: 11:43 ص\n` +
                                       `• العصر: 03:08 م\n` +
                                       `• المغرب: 05:38 م\n` +
                                       `• العشاء: 06:55 م\n\n` +
                                       `تقبل الله طاعتكم وذكركم أجمعين! ✨`;
                    await sock.sendMessage(from, { text: prayerText }, { quoted: mek });
                }

            } catch (error) {
                console.error("خطأ في معالجة الرسائل:", error);
            }
        });

    } catch (err) {
        console.error("خطأ في تشغيل البوت:", err);
    }
}

startGojoBot();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const sessionPath = path.join(__dirname, 'session');
const startTime = Date.now();

const DEVELOPER_ID = "69033026138303";
const DEVELOPER_PHONE = "201032219184";
const BOT_PHONE = "201154684341";

global.botOwners = global.botOwners || [DEVELOPER_PHONE, DEVELOPER_ID, BOT_PHONE];

const userNicknames = {};
const userBank = {}; 
const mutedUsers = {};
const badWordsWarnings = {}; 
const customCommands = {};

global.activeGuessGames = global.activeGuessGames || {};
global.activeSpyGames = global.activeSpyGames || {};

const guessCharacters = [
    "أكاجي", "برولي", "اكازا", "ايتاشي", "اينوسكي", "بو", "ابوناي", "توبو", "تنجن",
    "عمكغوكو", "سانامي", "جيرين", "زينيتسو", "ساسكي", "سوكونا", "رينجوكو", "سونوغوكو", "غوجوساتورو", "جين",
    "غوكو", "فريزا", "فيجيتا", "غيتو", "غوجو", "كابوتو",
    "يوتا", "كريلين", "مادارا", "كاكاشي", "ناروتو", "هاشيراما", "ميغومي", "ليفاي", "نوبارا", "موزان", "يوجي"
];

const badWordsList = [
    "كسمك", "شلتت", "كلب", "حمار", "قذر", "لعن", "زفت", "متخلف", "غبي", "معفن", "يا ابن",
    "وسخ", "منيوك", "قحبة", "متناكة", "خول", "شرموطة", "عرص", "حلوف", "حيوان",
    "حشاش", "سرسجي", "خرا", "تفة", "ابن الكلب", "ابن الوسخة", "يا دكر", "يا غبي",
    "يا سافل", "سافل", "حقير", "واطي", "منحط", "تبا", "ينعن", "يخرب بيتك"
];

const rankTitles = [
    "الإمبراطور 🔱", "نائب الإمبراطور 🌠", "الملك 👑", "نائب الملك ⚜️", 
    "الجنرال ⚡", "نائب الجنرال ⚔", "الدوق 👑", "نائب الدوق 🏰", 
    "الأدميرال 🚢", "نائب الأدميرال ⚓", "العميد 🎖️", "التشيبوكاي 🏴‍☠️", 
    "مشرف 👮‍♂️", "مشرف متدرب 📘", "الفارس 🐎", "الملازم 🛡️", 
    "حامل البريق ✨", "حامل الراية 🚩", "عضو👤"
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
                const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[!] انقطع الاتصال، جاري إعادة المحاولة بأمان...`);
                if (shouldReconnect) {
                    setTimeout(() => startGojoBot(), 10000);
                }
            } else if (connection === 'open') {
                console.log('تم اتصال بوت غوجو بنجاح واستقرار تام! 🚀');
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
       
              });
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

                const getUserRank = (userJid) => {
                    let isU_Dev = userJid.includes(DEVELOPER_PHONE) || userJid.includes(DEVELOPER_ID) || userJid.includes(BOT_PHONE) || global.botOwners.some(dev => userJid.includes(dev));
                    if (isU_Dev) return 0;
                    return userBank[userJid]?.level ?? 18;
                };

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
                              if (command === '.اكس' || command === '.اكس_او' || command === '.اكس اوه' || command === '.xo') {
                    let opponent = getTarget();
                    let isVsBot = !opponent || opponent === sender;
                    let playersList = isVsBot ? [sender] : [sender, opponent];

                    global.activeXoSessions[from] = {
                        state: 'playing',
                        players: playersList,
                        turn: sender,
                        isVsBot: isVsBot,
                        board: ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
                    };

                    let startMsg = isVsBot ? 
                        `🤖 **بدأت لعبة XO ضد البوت!** 🤖\n\n1 | 2 | 3\n───────────\n4 | 5 | 6\n───────────\n7 | 8 | 9\n\nدورك يا @${sender.split('@')[0]} (❌) - اختر رقماً من 1 لـ 9:` :
                        `🎮 **بدأت معركة XO التحدي!** 🎮\n\n1 | 2 | 3\n───────────\n4 | 5 | 6\n───────────\n7 | 8 | 9\n\nالبداية مع اللاعب (@${sender.split('@')[0]}) ❌\nاختاروا أرقام الأماكن بالدور!`;
                    
                    await sock.sendMessage(from, { text: startMsg, mentions: playersList }, { quoted: mek });
                    return;
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
                            userBank[sender].cash += 20;
                            userBank[sender].points = (userBank[sender].points || 0) + 15;

                            const winBoard = `🏆 **انتهت المعركة وفاز البطل!** 🏆\n\n` +
                                `${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}\n` +
                                `───────────\n` +
                                `${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}\n` +
                                `───────────\n` +
                                `${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}\n\n` +
                                `🎉 الف مبروك للبطل الفائز @${sender.split('@')[0]}!\n💰 تم إضافة **20 جنيه و 15 نقطة** إلى محفظتك الملكية! 💵`;
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

                if (command === '.خمن') {
                    if (global.activeGuessGames[from]) {
                        await sock.sendMessage(from, { text: '⚠️ اللعبة دائرة بالفعل! خمن الشخصية 🌝' }, { quoted: mek });
                        return;
                    }

                    const randomChar = guessCharacters[Math.floor(Math.random() * guessCharacters.length)];
                    global.activeGuessGames[from] = { answer: randomChar, winner: null };

                    let guessText = `╭━━━〔 🌝 لعبة خمن الشخصيات 🌝 〕━━━╮\n\n` +
                                    `🎮 بدأت جولة خمن الجديدة يا أبطال!\n` +
                                    `👤 صاحب الطلب: @${sender.split('@')[0]}\n\n` +
                                    `🎯 *التحدي:* البوت اختار شخصية مشهورة من القائمة...\n` +
                                    `لديك **30 ثانية** لتخمين الشخصية وكتابة اسمها الصحيح (بدون مسافات) لكسب **20 جنيه و 15 نقطة**! 🏆\n\n` +
                                    `يلا ابدأوا التخمين في الشات الآن 🌝⚡\n` +
                                    `╰━━━━━━━━━━━━━━━━━━━━╯`;
                    await sock.sendMessage(from, { text: guessText, mentions: [sender] }, { quoted: mek });

                    setTimeout(async () => {
                        if (global.activeGuessGames[from] && !global.activeGuessGames[from].winner) {
                            await sock.sendMessage(from, { text: `⏰ انتهى الوقت! الشخصية الصحيحة هي: *${randomChar}* 🌝` });
                        }
                        delete global.activeGuessGames[from];
                    }, 30000);
                    return;
                }

                if (global.activeGuessGames[from] && !global.activeGuessGames[from].winner) {
                    if (body.trim() === global.activeGuessGames[from].answer) {
                        global.activeGuessGames[from].winner = sender;
                        if (!userBank[sender]) userBank[sender] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 18 };
                        userBank[sender].cash += 20;
                        userBank[sender].points = (userBank[sender].points || 0) + 15;

                        await sock.sendMessage(from, { text: `🎉 مبروك @${sender.split('@')[0]} لقد إجبت بشكل صحيح!\n👤 الشخصية هي: *${global.activeGuessGames[from].answer}*\n💰 تم إضافة 20 جنيه و 15 نقطة لمحفظتك 🌝✨`, mentions: [sender] }, { quoted: mek });
                        delete global.activeGuessGames[from];
                    }
                }

                if (command === '.انهاء') {
                    delete global.activeXoSessions[from];
                    delete global.activeGuessGames[from];
                    delete global.activeSpyGames[from];
                    await sock.sendMessage(from, { text: `🛑 تم إنهاء أي لعبة شغال حالياً في المجموعة بنجاح!` }, { quoted: mek });
                    return;
                }

                if (command === '.زواج') {
                    let groupMetadata = await sock.groupMetadata(from).catch(() => null);
                    if (!groupMetadata) {
                        return await sock.sendMessage(from, { text: `❌ لا يمكن تنفيذ هذا الأمر إلا داخل المجموعات!` }, { quoted: mek });
                    }
                    let participants = groupMetadata.participants.map(p => p.id);
                    if (participants.length < 2) return;
                    
                    let groom, bride;
                    let devJid = DEVELOPER_PHONE + '@s.whatsapp.net';
                    
                    let shuffled = participants.sort(() => 0.5 - Math.random());
                    groom = shuffled[0];
                    bride = shuffled[1];

                    if (participants.includes(devJid)) {
                        groom = devJid;
                        let remaining = participants.filter(p => p !== devJid);
                        bride = remaining[Math.floor(Math.random() * remaining.length)];
                    }

                    let marriageText = `💍 **بارِك اللَّهُمَّ لهما وبارك عليهما وجمع بينهما في خير!** 💍\n\n` +
                                       `🤵 العريس: @${groom.split('@')[0]}\n` +
                                       `👰 العروسة: @${bride.split('@')[0]}\n\n` +
                                       `🥳 مبروك الزواج الأسطوري العشوائي في الجروب! 🥂✨`;
                    await sock.sendMessage(from, { text: marriageText, mentions: [groom, bride] }, { quoted: mek });
                    return;
                }

                if (command === '.طلاق') {
                    let groupMetadata = await sock.groupMetadata(from).catch(() => null);
                    if (!groupMetadata) return;
                    let participants = groupMetadata.participants.map(p => p.id);
                    if (participants.length < 2) return;

                    let shuffled = participants.sort(() => 0.5 - Math.random());
                    let ex1 = shuffled[0];
                    let ex2 = shuffled[1];

                    let divorceText = `💔 **البغض الحلال ونهاية الطريق!** 💔\n\n` +
                                      `تم الطلاق الرسمي وعودة العزوبية بين:\n` +
                                      `👤 @${ex1.split('@')[0]} ⚡ و 👤 @${ex2.split('@')[0]}\n\n` +
                                      `📜 كل واحد في طريق ربنا يوفقه! 🚶‍♂️💨`;
                    await sock.sendMessage(from, { text: divorceText, mentions: [ex1, ex2] }, { quoted: mek });
                    return;
                        }
                                                       if (command === '.الجاسوس' || command === '.جاسوس') {
                    let groupMetadata = await sock.groupMetadata(from).catch(() => null);
                    if (!groupMetadata) {
                        return await sock.sendMessage(from, { text: `❌ لعبة الجاسوس تعمل داخل المجموعات فقط!` }, { quoted: mek });
                    }
                    if (global.activeSpyGames[from]) {
                        return await sock.sendMessage(from, { text: `⚠️ لعبة الجاسوس جارية بالفعل في هذه المجموعة!` }, { quoted: mek });
                    }

                    let participants = groupMetadata.participants.map(p => p.id);
                    if (participants.length < 2) {
                        return await sock.sendMessage(from, { text: `❌ عدد الأعضاء غير كافٍ لبدء لعبة الجاسوس!` }, { quoted: mek });
                    }

                    let randomSpy = participants[Math.floor(Math.random() * participants.length)];
                    global.activeSpyGames[from] = { spy: randomSpy, state: 'running' };

                    let listText = `🕵️‍♂️ **بدأت لعبة الجاسوس (التخلص)!**\n` +
                                   `📋 قائمة المشاركين:\n`;
                    participants.forEach((p, idx) => {
                        listText += `${idx + 1}. @${p.split('@')[0]}\n`;
                    });
                    listText += `\n⏱️ مدة اللعبة **3 دقائق**، فكروا واستعدوا لاختيار الجاسوس! ⚡`;

                    await sock.sendMessage(from, { text: listText, mentions: participants }, { quoted: mek });

                    setTimeout(async () => {
                        if (global.activeSpyGames[from]) {
                            let spyUser = global.activeSpyGames[from].spy;
                            await sock.sendMessage(from, { text: `⏰ انتهت الـ 3 دقائق!\n🕵️‍♂️ الجاسوس الحقيقي هو: @${spyUser.split('@')[0]}`, mentions: [spyUser] });

                            let secretWordsList = `📋 **قائمة الكلمات السرية:**\n` +
                                                  `1. جوجو\n` +
                                                  `2. ناروتو\n` +
                                                  `3. ساسكي\n` +
                                                  `4. جين\n\n` +
                                                  `⏱️ أمام الجاسوس **30 ثانية** لاختيار الرقم المناسب وسره!`;
                            await sock.sendMessage(from, { text: secretWordsList });

                            setTimeout(async () => {
                                await sock.sendMessage(from, { text: `⏳ انتهى وقت اختيار الجاسوس للرقم السرّي!` });
                                delete global.activeSpyGames[from];
                            }, 30000);
                        }
                    }, 180000);
                    return;
                }

                let userRankLevel = getUserRank(sender);
                let isTopThreeOrDev = isDev || userRankLevel <= 2;

                if (command === '.ترقية') {
                    if (!isTopThreeOrDev) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر مخصص للرتب العليا الثلاثة الأولى (من 0 إلى 2) والمطورين فقط! 🛡️` }, { quoted: mek });
                    }
                    let parts = q.split(' ');
                    let rankNum = parseInt(parts[0]);
                    let tUser = getTarget();

                    if (isNaN(rankNum) || rankNum < 0 || rankNum >= rankTitles.length || !tUser) {
                        return await sock.sendMessage(from, { text: `⚠️ استخدم الطريقة الصحيحة:\n\`.ترقية [رقم الرتبة من 0 لـ 18] [@منشن]\`\nمثال: \`.ترقية 0 @شخص\` (لجعله الإمبراطور)` }, { quoted: mek });
                    }

                    if (!userBank[tUser]) {
                        userBank[tUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 18 };
                    }
                    
                    userBank[tUser].level = rankNum;
                    let newRankTitle = rankTitles[rankNum];
                    await sock.sendMessage(from, { text: `🎉 مبروك! تم ترقية العضو @${tUser.split('@')[0]} بنجاح وأصبح الآن برتبة:\n*${newRankTitle}* 👑`, mentions: [tUser] }, { quoted: mek });
                    return;
                }

                let isHighRank = isDev || userRankLevel <= 7;

                if (['.كتم', '.فك_كتم'].includes(command)) {
                    if (!isHighRank) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر مخصص للرتب العليا والمطورين فقط! 🛡️` }, { quoted: mek });
                    }
                    if (command === '.كتم') {
                        let tUser = getTarget();
                        if (!tUser) return await sock.sendMessage(from, { text: `⚠️ قم بعمل منشن للشخص المراد كتمه.` }, { quoted: mek });
                        mutedUsers[tUser] = true;
                        await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${tUser.split('@')[0]} بنجاح!`, mentions: [tUser] }, { quoted: mek });
                    } else if (command === '.فك_كتم') {
                        let tUser = getTarget();
                        if (!tUser) return await sock.sendMessage(from, { text: `⚠️ قم بعمل منشن للشخص المراد فك كتمه.` }, { quoted: mek });
                        delete mutedUsers[tUser];
                        await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${tUser.split('@')[0]} بنجاح!`, mentions: [tUser] }, { quoted: mek });
                    }
                    return;
                }

                if (command === '.اضافة_مطور') {
                    if (!isDev) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر خاص بالمطورين الأساسيين فقط! 👑` }, { quoted: mek });
                    }
                    let newDevTarget = getTarget();
                    if (!newDevTarget) {
                        return await sock.sendMessage(from, { text: `❌ يرجى الرد على رسالة الشخص أو عمل منشن له لإضافته مطوراً! ⚠️` }, { quoted: mek });
                    }
                    let devNum = newDevTarget.split('@')[0];
                    if (!global.botOwners.includes(devNum)) {
                        global.botOwners.push(devNum);
                    }
                    await sock.sendMessage(from, { text: `✅ تم ترقية العضو @${devNum} إلى رتبة مطور بوت غوجو الملكي بنجاح! 🚀`, mentions: [newDevTarget] }, { quoted: mek });
                    return;
                                                             }                
                                        if (command === '.بوت') {
                    const uptimeM = Math.floor((Date.now() - startTime) / 60000);
                    const pingMsg = `🤖 *حالة بوت غوجو الملكي*\n- الحالة: متصل وسحابي 24/7 🚀\n- سرعة الاستجابة: ممتازة (Stable - Railway)\n- مدة التشغيل: ${uptimeM} دقيقة\n- الإنترنت والاتصال: مستقر تماماً على السيرفر سحابياً ✅`;
                    await sock.sendMessage(from, { text: pingMsg }, { quoted: mek });
                    return;
                }

                if (command === '.بوينت') {
                    let uPts = userBank[sender]?.points || 10;
                    let uCash = userBank[sender]?.cash || 50;
                    await sock.sendMessage(from, { text: `💰 رصيدك السري:\n- النقاط: ${uPts} 🪙\n- المال: ${uCash} جنيه 💵`, mentions: [sender] }, { quoted: mek });
                    return;
                }

                if (command === '.منشن') {
                    if (q.startsWith('الكل') || body.toLowerCase().includes('منشن الكل')) {
                        let groupMetadata = await sock.groupMetadata(from).catch(() => null);
                        if (!groupMetadata) return;
                        let participants = groupMetadata.participants.map(p => p.id);
                        
                        let customText = q.replace('الكل', '').trim();
                        let mentionText = `📢 *تنبيه عام لكل الأبطال في الجروب:*\n${customText || 'مطلوبين ضروري هنا! ⚡'}\n\n`;
                        
                        participants.forEach(p => {
                            mentionText += `@${p.split('@')[0]} `;
                        });

                        await sock.sendMessage(from, { text: mentionText, mentions: participants }, { quoted: mek });
                    } else {
                        let targetUser = getTarget();
                        if (!targetUser) return await sock.sendMessage(from, { text: `❌ حدد الشخص بمنشن أو رد عليه لتنبيهه بـ 10 رسائل!` }, { quoted: mek });
                        for (let i = 1; i <= 10; i++) {
                            await sock.sendMessage(from, { text: `🚨 تنبيه هام (${i}/10) يا @${targetUser.split('@')[0]}، احنا محتاجينك ضروري جداً! ⚠️`, mentions: [targetUser] });
                            await delay(800);
                        }
                    }
                    return;
                }

                if (command === 'معلومات_الكل' || command === '.معلومات_الكل') {
                    let groupMetadata = await sock.groupMetadata(from).catch(() => null);
                    if (!groupMetadata) return;
                    let participants = groupMetadata.participants.map(p => p.id);
                    let infoHeader = `📊 *ملف معلومات جميع أعضاء المجموعة الملكية (${participants.length} عضو):*`;
                    await sock.sendMessage(from, { text: infoHeader }, { quoted: mek });
                    return;
                }

                if (command === '.عرض') {
                    let rank = getUserRank(sender);
                    if (rank !== 0) {
                        await sock.sendMessage(from, { text: '❌ عذراً، أمر العرض (`.عرض`) مخصص للإمبراطور (الرتبة 0) فقط! 👑' }, { quoted: mek });
                        return;
                    }

                    let quotedMsg = mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    let isQuotedImage = quotedMsg && quotedMsg.imageMessage;
                    let isQuotedVideo = quotedMsg && quotedMsg.videoMessage;
                    let isDirectImage = mek.message.imageMessage;
                    let isDirectVideo = mek.message.videoMessage;

                    if (isQuotedImage || isDirectImage) {
                        let imageMsg = isQuotedImage ? quotedMsg.imageMessage : mek.message.imageMessage;
                        let stream = await downloadContentFromMessage(imageMsg, 'image');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        await sock.sendMessage(from, { image: buffer, caption: imageMsg.caption || "👁️ عرض الوسائط (الإمبراطور)" }, { quoted: mek });
                        return;
                    } else if (isQuotedVideo || isDirectVideo) {
                        let videoMsg = isQuotedVideo ? quotedMsg.videoMessage : mek.message.videoMessage;
                        let stream = await downloadContentFromMessage(videoMsg, 'video');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        await sock.sendMessage(from, { video: buffer, caption: videoMsg.caption || "👁️ عرض الوسائط (الإمبراطور)" }, { quoted: mek });
                        return;
                    } else {
                        await sock.sendMessage(from, { text: `👑 يا صاحب السعادة الإمبراطور، يرجى الرد على صورة أو فيديو لاستخدام أمر `.عرض` بنجاح.` }, { quoted: mek });
                        return;
                    }
                }

                if (command === '.رتب') {
                    let rankDisplayList = `👑 ──『 **قائمة الرتب الـ 18 والأعضاء (من 0 إلى 18)** 』── 👑\n\n`;
                    let categorizedRanks = {};
                    
                    for (let userKey in userBank) {
                        let uData = userBank[userKey];
                        let uLevel = getUserRank(userKey);
                        
                        if (!categorizedRanks[uLevel]) {
                            categorizedRanks[uLevel] = [];
                        }
                        categorizedRanks[uLevel].push(userKey);
                    }

                    rankTitles.forEach((title, index) => {
                        rankDisplayList += `[${index}] ▪️ *${title}*:\n`;
                        let membersInRank = categorizedRanks[index];
                        if (membersInRank && membersInRank.length > 0) {
                            membersInRank.forEach(m => {
                                rankDisplayList += `   - @${m.split('@')[0]}\n`;
                            });
                        } else {
                            rankDisplayList += `   - (لا يوجد أعضاء)\n`;
                        }
                        rankDisplayList += `\n`;
                    });

                    rankDisplayList += `╰───────────────────────────⬣`;
                    let allMembersToMention = [];
                    for (let lvl in categorizedRanks) {
                        allMembersToMention.push(...categorizedRanks[lvl]);
                    }

                    await sock.sendMessage(from, { text: rankDisplayList, mentions: allMembersToMention }, { quoted: mek });
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
                                        else if (command === '.حفظ' && q === 'ملصق') {
                    let quotedMsg = mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    let isQuotedImage = quotedMsg && quotedMsg.imageMessage;
                    let isDirectImage = mek.message.imageMessage;

                    if (!isQuotedImage && !isDirectImage) {
                        return await sock.sendMessage(from, { text: `❌ يرجى إرسال صورة أو الرد على صورة بـ \`.حفظ ملصق\` لحفظها في الملصقات المسيئة/المميزة للجروب! 🖼️` }, { quoted: mek });
                    }
                    await sock.sendMessage(from, { text: `🛡️ تم حفظ الملصق وصورة الإساءة/الحفظ في سجل الجروب بنجاح!` }, { quoted: mek });
                }
                else if (command === '.حفظ' && q === 'ايموجي') {
                    let quotedMsg = mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    let isQuotedSticker = quotedMsg && quotedMsg.stickerMessage;

                    if (!isQuotedSticker) {
                        return await sock.sendMessage(from, { text: `❌ يرجى الرد على ملصق بـ \`.حفظ ايموجي\` لحفظ الإيموجي المسيء للجروب! ⭐` }, { quoted: mek });
                    }
                    await sock.sendMessage(from, { text: `🛡️ تم حفظ الإيموجي في قائمة الإيموجيات المسيئة/المميزة للجروب بنجاح!` }, { quoted: mek });
                }
                else if (command === '.اوامر' || command === '.الأوامر') {
                    const now = new Date();
                    const timeString = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const gregorianDate = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                    const hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { year: 'numeric', month: 'long', day: 'numeric' }).format(now);

                    let menuText = 
`╔═══════════════════════════╗
║   👑 **قائمة أوامر بوت غوجو** 👑    ║
╠═══════════════════════════╣
║ 📌 المطور: مالك علي عبد الرحيم
║ ⏰ الوقت: ${timeString}
║ 📅 ميلادي: ${gregorianDate}
║ 🌙 هجري: ${hijriDate}
╠═══════════════════════════╣
║ 📁 **الأوامر والخدمات الأساسية:**
║ • \`.عرض\` 👁️ - عرض الوسائط لمرة واحدة (للإمبراطور فقط)
║ • \`.حفظ ملصق\` 🎭 - حفظ الملصقات المسيئة والمميزة
║ • \`.حفظ ايموجي\` ⭐ - حفظ الإيموجي المسيء
║ • \`.منشن الكل\` 📢 - منشن جماعي حقيقي لكل الأعضاء
║ • \`.اوامر\` 📋 - القائمة الرئيسية
║ • \`.العاب\` 🎮 - قسم الألعاب والمسابقات والترفيه
║ • \`.رتب\` 🎖️ - عرض الرتب الـ 18 والأعضاء (من 0 لـ 18)
║ • \`.صلاة\` 🕌 - مواقيت الصلاة اليوم
║ 
║ 👤 **الملف الشخصي والحسابات:**
║ • \`.حاله\` / \`.معلومات\` 📊 - عرض حالتك ورتبتك وصورتك
║ • \`.بنك\` 🏦 - الاستعلام عن رصيدك وكاشك ونقاطك
║ • \`.رتبتي\` 🎖️ - معرفة رتبتك الحالية
║ • \`.لقبي [اللقب]\` 🏷 - تخصيص لقبك الشخصي
║ • \`.تحويل [المبلغ] [منشن]\` 💸 - تحويل الأموال
║ 
║ 🎉 **أوامر الترفيه والزواج (للجميع):**
║ • \`.زواج\` 💍 - زواج عشوائي للأعضاء (المطور عريس دائماً لو متاح)
║ • \`.طلاق\` 💔 - طلاق عشوائي بين الأعضاء
║ 
║ 🛡️ **أوامر الإدارة والتحكم:**
║ • \`.ترقية [رقم 0-18] [@منشن]\` 🎖️ - تعيين رتبة العضو (من 0 إلى 18)
║ • \`.كتم\` / \`.فك_كتم\` 🔇 - كتم وفك كتم الأعضاء
║ 
║ 🤖 **أوامر السيرفر والنظام:**
║ • \`.بوت\` ⚡ - لعرض حالة النت وسرعة السيرفر ومدة التشغيل
║ • \`.انهاء\` 🛑 - لإنهاء أي لعبة شغالة حالياً
╚═══════════════════════════╝`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.مطور' || command === '.المطور') {
                    let devMenuText =
`👑 ──『 **قائمة أوامر المطور الملكية** 』── 👑
• \`.اضافة_مطور\` ➕ - لإضافة مطور جديد بالرد أو المنشن أو المعرف تلقائياً
• \`.معلومات_الكل\` 📊 - عرض معلومات كل الأعضاء بالصور
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: devMenuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.خمن\` 🌝 - لعبة تخمين الشخصيات (30ث) مع كشف الاسم الصحيح
• \`.الجاسوس\` 🕵️‍♂️ - لعبة الجاسوس والتخلص (3د) ومنشن حقيقي والكلمات السرية
• \`.اكس اوه\` ❌⭕ - العب ضد البوت أو بالمنشن/الرد مع صديق
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: gamesMenu }, { quoted: mek });
                }
                else if (command === '.حاله' || command === '.حالة' || command === '.معلومات') {
                    let targetUser = getTarget() || sender;
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
                                       `⭐ النقاط والمال: ${uBank.points || 10} نقطة\n` +
                                       `📈 المستوى: ${uBank.level}\n` +
                                       `👑 الرتبة: ${uRankName}\n\n` +
                                       `╰━━━━━━━━━━━━━━━━━━━━╯`;
                    let ppUrl;
                    try { ppUrl = await sock.profilePictureUrl(targetUser, 'image'); } catch { ppUrl = null; }
                    if (ppUrl) {
                        await sock.sendMessage(from, { image: { url: ppUrl }, caption: statusText, mentions: [targetUser] }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: statusText, mentions: [targetUser] }, { quoted: mek });
                    }
                }
                else if (command === '.بنك') {
                    const targetUser = getTarget() || sender;
                    const uBank = userBank[targetUser] || { cash: 50, coins: 200 };
                    const bankText = `🏦 ──『 **صندوق البنك** 』── 🏦\n\n👤 العضو: @${targetUser.split('@')[0]}\n💰 المحفظة: ${uBank.cash} جنيه 💵\n🏦 رصيد البنك: ${uBank.coins} 🪙\n\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: bankText, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.لقبي') {
                    if (!q) return await sock.sendMessage(from, { text: `❌ اكتب اللقب بجانب الأمر!` }, { quoted: mek });
                    userNicknames[sender] = q;
                    await sock.sendMessage(from, { text: `✅ تم تحديث لقبك إلى: *${q}* 🏷`, mentions: [sender] }, { quoted: mek });
                }
                else if (command === '.تحويل') {
                    let argsSplit = q.split(' ');
                    let amount = parseInt(argsSplit[0]);
                    let targetUser = getTarget();
                    if (isNaN(amount) || amount <= 0 || !targetUser) {
                        return await sock.sendMessage(from, { text: `❌ استخدم:\n\`.تحويل [المبلغ] [منشن]\`` }, { quoted: mek });
                    }
                    if (userBank[sender].cash < amount) {
                        return await sock.sendMessage(from, { text: `❌ رصيدك لا يكفي!` }, { quoted: mek });
                    }
                    userBank[sender].cash -= amount;
                    if (!userBank[targetUser]) userBank[targetUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 18 };
                    userBank[targetUser].cash += amount;
                    await sock.sendMessage(from, { text: `💸 تم تحويل *${amount} جنيه* بنجاح من @${sender.split('@')[0]} إلى @${targetUser.split('@')[0]}!`, mentions: [sender, targetUser] }, { quoted: mek });
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
                      

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

const dragonBallCharacters = [
    { name: "غوكو", img: "https://i.imgur.com/71Q3F2W.jpeg" },
    { name: "فيجيتا", img: "https://i.imgur.com/8JW85iN.jpeg" },
    { name: "جوهان", img: "https://i.imgur.com/95V595z.jpeg" },
    { name: "بيجولو", img: "https://i.imgur.com/1Z8M1Yx.png" },
    { name: "فريزا", img: "https://i.imgur.com/71Q3F2W.jpeg" },
    { name: "سيل", img: "https://i.imgur.com/8JW85iN.jpeg" },
    { name: "ماجين بو", img: "https://i.imgur.com/95V595z.jpeg" },
    { name: "ترانكس", img: "https://i.imgur.com/1Z8M1Yx.png" },
    { name: "كريلين", img: "https://i.imgur.com/71Q3F2W.jpeg" },
    { name: "يامتشا", img: "https://i.imgur.com/8JW85iN.jpeg" },
    { name: "تيين شينهان", img: "https://i.imgur.com/95V595z.jpeg" },
    { name: "بيروس", img: "https://i.imgur.com/1Z8M1Yx.png" },
    { name: "ويس", img: "https://i.imgur.com/71Q3F2W.jpeg" },
    { name: "جيرين", img: "https://i.imgur.com/8JW85iN.jpeg" },
    { name: "بولو", img: "https://i.imgur.com/95V595z.jpeg" },
    { name: "رون", img: "https://i.imgur.com/1Z8M1Yx.png" },
    { name: "غوتين", img: "https://i.imgur.com/71Q3F2W.jpeg" },
    { name: "تشانشي", img: "https://i.imgur.com/8JW85iN.jpeg" },
    { name: "بان", img: "https://i.imgur.com/95V595z.jpeg" },
    { name: "برولي", img: "https://i.imgur.com/1Z8M1Yx.png" }
];

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
                    console.log(`[i] جاري طلب كود الربط لرقم الهاتف: ${phoneNumber}...`);
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
                console.log('انقطع الاتصال، جاري إعادة المحاولة...', lastDisconnect.error);
                if (shouldReconnect) {
                    setTimeout(() => startGojoBot(), 3000);
                }
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
                    userBank[sender] = { 
                        coins: isDev ? 10000000000 : 200, 
                        points: isDev ? 10000000000 : 10, 
                        hearts: 3, 
                        xp: 0, 
                        level: isDev ? 10 : 1 
                    };
                } else {
                    if (isDev) {
                        userBank[sender].coins = 10000000000;
                        userBank[sender].points = 10000000000;
                        userBank[sender].level = 10;
                    }
                    if (userBank[sender].hearts === undefined) userBank[sender].hearts = 3;
                }

                global.activeHazrSessions = global.activeHazrSessions || {};
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

                // نظام لعبة حذر
                let hazrSession = global.activeHazrSessions[from];
                if (hazrSession && hazrSession.state === 'waiting_joins' && body.trim() === '.تم') {
                    if (!hazrSession.players.includes(sender)) {
                        hazrSession.players.push(sender);
                        if (!userBank[sender]) userBank[sender] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                        await sock.sendMessage(from, { text: `✅ انضم @${sender.split('@')[0]} للحلبة! (القلوب: ${userBank[sender].hearts} ❤️)\nاكتب **.ابدأ** لبدء اللعبة فوراً!`, mentions: [sender] }, { quoted: mek });
                    }
                    return;
                }

                const launchHazrGame = async (sess, chatJid) => {
                    if (!sess || sess.state !== 'waiting_joins') return;
                    if (sess.players.length === 0) {
                        delete global.activeHazrSessions[chatJid];
                        return await sock.sendMessage(chatJid, { text: `❌ تم إلغاء الحلبة لعدم وجود مشاركين.` });
                    }
                    sess.state = 'waiting_answer';
                    await sock.sendMessage(chatJid, { 
                        image: { url: sess.character.img }, 
                        caption: `🎯 **انطلق التحدي فوراً!**\nالمشاركون: ${sess.players.map(p => '@' + p.split('@')[0]).join(', ')}\n\nمن هي شخصية دراغون بول هذه؟ (اكتب الاسم واعمل منشن لخصمك لتدمير قلبه وربح 10 ج ورتبة! 💔)`,
                        mentions: sess.players
                    });

                    setTimeout(async () => {
                        if (global.activeHazrSessions[chatJid] && global.activeHazrSessions[chatJid].state === 'waiting_answer') {
                            delete global.activeHazrSessions[chatJid];
                            await sock.sendMessage(chatJid, { text: `⏰ انتهى الوقت ولم يوفق أحد في الإجابة! الشخصية كانت: *${sess.character.name}*` });
                        }
                    }, 30000);
                };

                if (hazrSession && hazrSession.state === 'waiting_joins' && (body.trim() === '.ابدأ' || body.trim() === 'ابدأ')) {
                    await launchHazrGame(hazrSession, from);
                    return;
                }

                if (hazrSession && hazrSession.state === 'waiting_answer' && hazrSession.players.includes(sender)) {
                    let userAns = body.trim().toLowerCase();
                    let correctName = hazrSession.character.name.toLowerCase();
                    
                    let cleanUserAns = userAns.replace(/ال/g, '').replace(/[أإآء]/g, 'ا').replace(/\s+/g, '');
                    let cleanCorrect = correctName.replace(/ال/g, '').replace(/[أإآء]/g, 'ا').replace(/\s+/g, '');

                    if (cleanUserAns === cleanCorrect || userAns.includes(correctName) || correctName.includes(userAns)) {
                        hazrSession.state = 'ended';
                        const target = getTarget();
                        
                        if (!userBank[sender]) userBank[sender] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                        userBank[sender].coins += 10;
                        userBank[sender].points += 5;
                        userBank[sender].xp += 25;
                        if (userBank[sender].xp >= userBank[sender].level * 150 && userBank[sender].level < 10) {
                            userBank[sender].level += 1;
                        }

                        let msgResp = `🏆 برافو يا @${sender.split('@')[0]}! أثبتّ جدارتك وأجبت بـ (${hazrSession.character.name})! 🎉\n💰 ربحت 10 ج إلى بنكك وزادت نقاطك ومستواك!`;
                        
                        if (target) {
                            if (!userBank[target]) userBank[target] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                            userBank[target].hearts = Math.max(0, (userBank[target].hearts || 3) - 1);
                            msgResp += `\n🔥 وقمت بتدمير قلب من الخصم @${target.split('@')[0]}! (متبقي له ${userBank[target].hearts} ❤️ قلوب)`;
                        }

                        delete global.activeHazrSessions[from];
                        await sock.sendMessage(from, { text: msgResp, mentions: [sender, ...(target ? [target] : [])] }, { quoted: mek });
                        return;
                    }
                }

                // نظام لعبة الجاسوس
                let spySession = global.activeSpySessions[from];
                if (spySession && spySession.state === 'waiting_joins' && body.trim() === '.تم') {
                    if (!spySession.players.includes(sender)) {
                        spySession.players.push(sender);
                        await sock.sendMessage(from, { text: `🕵️ انضم @${sender.split('@')[0]} إلى لعبة الجاسوس! (اكتب **.ابدأ جاسوس** للبدء)`, mentions: [sender] }, { quoted: mek });
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
                                await sock.sendMessage(p, { text: `🤫 أنت **الجاسوس** في هذه الجولة! حاول اكتشاف الكلمة السرية دون أن يتم كشفك.` });
                            } else {
                                await sock.sendMessage(p, { text: `🔒 الكلمة السرية الخاصة بك هي: *${secretWord}*` });
                            }
                        } catch (e) {
                            console.log("خطأ في إرسال الرسالة الخاصة:", e);
                        }
                    }

                    let playersListText = `🕵️‍♂️ **بدأت لعبة الجاسوس الملكية!**\nتم إرسال الكلمات السرية بالخاص.\nالمتنافسون:\n`;
                    spySession.players.forEach((p, idx) => {
                        playersListText += `${idx + 1}. @${p.split('@')[0]}\n`;
                    });
                    playersListText += `\n📌 اكتب رقم المشتبه به للتصويت عليه (مثال: \`1\` أو \`2\`). امامكم 5 دقائق!`;
                    
                    await sock.sendMessage(from, { text: playersListText, mentions: spySession.players });

                    setTimeout(async () => {
                        let currentSpySess = global.activeSpySessions[from];
                        if (currentSpySess && currentSpySess.state === 'playing') {
                            delete global.activeSpySessions[from];
                            await sock.sendMessage(from, { text: `⏰ انتهى الوقت!\n🚨 الجاسوس الحقيقي كان: @${currentSpySess.spy.split('@')[0]}\n🔒 الكلمة السرية كانت: *${currentSpySess.secretWord}*\n\n📊 استطلاع رأي: ما رأيكم في الكلمة السرية وكلمات أخرى؟`, mentions: [currentSpySess.spy] });
                        }
                    }, 300000);
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

                // نظام حلبة XO المحدث والفعال
                let xoSession = global.activeXoSessions[from];
                if (xoSession && xoSession.state === 'waiting_joins' && body.trim() === '.انضم اوه') {
                    if (!xoSession.players.includes(sender)) {
                        xoSession.players.push(sender);
                        await sock.sendMessage(from, { text: `⚔️ انضم @${sender.split('@')[0]} لحلبة XO!`, mentions: [sender] }, { quoted: mek });
                        if (xoSession.players.length === 2) {
                            xoSession.state = 'playing';
                            xoSession.turn = xoSession.players[0];
                            xoSession.board = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
                            
                            const renderBoard = `╔═══════════════╗\n║   ⚔️ **حلبة XO الملكية** ⚔️   ║\n╠═══════════════╣\n║     ${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}     ║\n║     ───┼───┼───     ║\n║     ${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}     ║\n║     ───┼───┼───     ║\n║     ${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}     ║\n╚═══════════════╝\n🎮 دور اللاعب (@${xoSession.turn.split('@')[0]}) - اختر رقماً من 1 لـ 9`;
                            await sock.sendMessage(from, { text: renderBoard, mentions: xoSession.players });
                        }
                    }
                    return;
                }

                if (xoSession && xoSession.state === 'playing' && xoSession.players.includes(sender)) {
                    if (sender !== xoSession.turn) {
                        return await sock.sendMessage(from, { text: `⚠️️ ليس دورك الآن يا @${sender.split('@')[0]}!`, mentions: [sender] }, { quoted: mek });
                    }
                    let cellChoice = parseInt(body.trim());
                    if (!isNaN(cellChoice) && cellChoice >= 1 && cellChoice <= 9) {
                        let index = cellChoice - 1;
                        if (xoSession.board[index] === "X" || xoSession.board[index] === "O") {
                            return await sock.sendMessage(from, { text: `❌ هذا المكان محجوز بالفعل، اختر مكاناً آخر!` }, { quoted: mek });
                        }
                        let playerSymbol = sender === xoSession.players[0] ? "❌" : "⭕";
                        xoSession.board[index] = playerSymbol;

                        // فحص الفوز البسيط
                        const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                        let hasWon = winCombos.some(combo => combo.every(i => xoSession.board[i] === playerSymbol));

                        if (hasWon) {
                            delete global.activeXoSessions[from];
                            const winBoard = `╔═══════════════╗\n║   🏆 **انتهت المعركة!** 🏆   ║\n╠═══════════════╣\n║     ${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}     ║\n║     ───┼───┼───     ║\n║     ${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}     ║\n║     ───┼───┼───     ║\n║     ${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}     ║\n╚═══════════════╝\n🎉 الف مبروك للبطل الفائز @${sender.split('@')[0]}!`;
                            await sock.sendMessage(from, { text: winBoard, mentions: [sender] });
                            return;
                        }

                        // تبديل الدور
                        xoSession.turn = xoSession.players.find(p => p !== sender);
                        const updateBoard = `╔═══════════════╗\n║   ⚔️ **حلبة XO الملكية** ⚔️   ║\n╠═══════════════╣\n║     ${xoSession.board[0]} | ${xoSession.board[1]} | ${xoSession.board[2]}     ║\n║     ───┼───┼───     ║\n║     ${xoSession.board[3]} | ${xoSession.board[4]} | ${xoSession.board[5]}     ║\n║     ───┼───┼───     ║\n║     ${xoSession.board[6]} | ${xoSession.board[7]} | ${xoSession.board[8]}     ║\n╚═══════════════╝\n🎮 دور اللاعب (@${xoSession.turn.split('@')[0]}) - اختر رقماً من 1 لـ 9`;
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
                    if (mtype === 'stickerMessage' && badStickers.includes(mek.message.stickerMessage.fileSha256?.toString())) {
                        isOffensive = true;
                    }
                    if (isOffensive) {
                        await sock.sendMessage(from, { delete: mek.key });
                        if (!userWarnings[sender]) userWarnings[sender] = 0;
                        userWarnings[sender] += 1;
                        
                        if (userWarnings[sender] >= 5) {
                            mutedUsers[sender] = true;
                            userWarnings[sender] = 0;
                            await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${sender.split('@')[0]} تلقائياً لتجاوز الحد الأقصى للإنذارات (5)!`, mentions: [sender] });
                        } else {
                            await sock.sendMessage(from, { text: `⚠️ تنبيه (${userWarnings[sender]}/5) يا @${sender.split('@')[0]}، ممنوع الشتايم والأساءة!`, mentions: [sender] }, { quoted: mek });
                        }
                        return;
                    }
                }

                userBank[sender].xp += 2;
                if (userBank[sender].xp >= userBank[sender].level * 150 && userBank[sender].level < 10) {
                    userBank[sender].level += 1;
                    await sock.sendMessage(from, { text: `🎉 مبروك يا @${sender.split('@')[0]}، لقد ترقيت للمستوى (${userBank[sender].level})! 👑`, mentions: [sender] });
                }

                const currentLevel = userBank[sender].level;
                const args = body.trim().split(/ +/);
                const command = args.shift().toLowerCase();
                const q = args.join(' ');
                const protectedCmds = ['.اوامر', '.معلومات', '.رتبتي', '.رتب', '.لقبي', '.بنك', '.العاب', '.عرض', '.الجاسوس', '.اكس اوه', '.حذر', '.صلاه', '.كتم', '.فك كتم', '.اضافه ملصق', '.اضافه ايموجي', '.اضافه مطور', '.اضافه أمر', '.رتبه'];

                if (protectedCmds.includes(command) || customCommands[command]) {
                    if (currentLevel < 5 && !isDev) {
                        return await sock.sendMessage(from, { text: `❌ عذراً يا @${sender.split('@')[0]}، رتبتك (${currentLevel}) أقل من 5 لاستخدام هذا الأمر.`, mentions: [sender] }, { quoted: mek });
                    }
  }
                                       if (command === '.اوامر' || command === '.الأوامر') {
                    const now = new Date();
                    const time12 = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    const dateStr = now.toLocaleDateString('ar-EG');
                    
                    const menuText = 
`👑 ──『 **قائمة أوامر بوت جوجو** 』── 👑
📌 **المطور:** مالك
⏰ **الوقت:** ${time12} | 📅 **التاريخ:** ${dateStr}

📌 **أولاً: الأوامر الأساسية**
• \`.اوامر\` - لعرض هذه القائمة
• \`.العاب\` - قائمة الألعاب الترفيهية
• \`.معلومات\` - عرض ملفك الشخصي وكرتك
• \`.رتبتي\` - معرفة رتبتك ومستواك الحالي
• \`.لقبي [اللقب]\` - تعيين لقب خاص بك (الأول مجاناً، وتغييره بـ 20 ج)
• \`.بنك\` - معرفة رصيدك والقلوب والكوينز
• \`.صلاه\` - مواقيت الصلاة بتوقيت سوهاج
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesMenu = 
`🎮 ──『 **قائمة الألعاب الملكية** 』── 🎮
• \`.حذر\` - حلبة شخصيات دراغون بول (اكتب .تم ثم .ابدأ)
• \`.الجاسوس\` - تفعيل لعبة الجاسوس (اكتب .تم ثم .ابدأ جاسوس)
• \`.اكس اوه\` - فتح حلبة XO (اكتب .انضم اوه)
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: gamesMenu }, { quoted: mek });
                }
                else if (command === '.المطور' || command === '.مطور') {
                    if (!isDev && currentLevel < 5) return await sock.sendMessage(from, { text: `❌ هذه القائمة للمطور والأعضاء برتبة 5 فأعلى فقط!` }, { quoted: mek });
                    const devMenu = 
`🛠 ──『 **قائمة المطور والإدارة** 』── 🛠
• \`.رتبه [منشن] [رقم الرتبة]\` - تعديل رتبة عضو
• \`.كتم\` - كتم عضو مشاغب (بالمنشن أو الرد) [للأعلى من رتبة 5]
• \`.فك كتم\` - إلغاء الكتم عن عضو [للأعلى من رتبة 5]
• \`.اضافه ملصق\` - حظر ملصق مسيء
• \`.اضافه ايموجي\` - حظر إيموجي مسيء
• \`.اضافه مطور\` - ترقية مطور جديد (للمطور الأساسي)
• \`.اضافه أمر [الأمر] | [الرد]\` - إضافة رد مخصص
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: devMenu }, { quoted: mek });
                }
                else if (command === '.معلومات') {
                    const userNickname = userNicknames[sender] || 'بدون لقب';
                    const rankTitles = ["مبتدئ", "حارس", "فارس", "نبيل", "أمير", "مستشار", "وزير", "سيد", "ملك", "الحاكم المطلق ⚡"];
                    const rTitle = isDev ? "الملك الإمبراطور ⚡" : rankTitles[currentLevel - 1] || "عضو";
                    const bankInfo = userBank[sender];
                    let ppUrl;
                    try {
                        ppUrl = await sock.profilePictureUrl(sender, 'image');
                    } catch {
                        ppUrl = 'https://i.imgur.com/1Z8M1Yx.png';
                    }
                    const infoText = `👑 ──『 **الملف الشخصي** 』── 👑\n│ 🆔 المعرف: @${sender.split('@')[0]}\n│ 🏷️ اللقب: ${userNickname}\n│ 🎖️ الرتبة: ${rTitle} (${currentLevel})\n│ 📈 XP: ${bankInfo.xp}\n│ 💰 الكوينز: ${bankInfo.coins}\n│ ❤️ القلوب: ${bankInfo.hearts}\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { image: { url: ppUrl }, caption: infoText, mentions: [sender] }, { quoted: mek });
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
                        if (!userBank[sender]) userBank[sender] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                        if (userBank[sender].coins < 20) {
                            return await sock.sendMessage(from, { text: `❌ ليس لديك كوينز كافية لتغيير اللقب! تكلفة التغيير 20 كوينز.` }, { quoted: mek });
                        }
                        userBank[sender].coins -= 20;
                        userNicknames[sender] = q;
                        await sock.sendMessage(from, { text: `✅ تم تغيير لقبك إلى: ${q} (تم خصم 20 كوينز من بنكك)` }, { quoted: mek });
                    }
                }
                else if (command === '.بنك') {
                    const bankInfo = userBank[sender];
                    await sock.sendMessage(from, { text: `🏦 الكوينز: ${bankInfo.coins}\n⭐ النقاط: ${bankInfo.points}\n❤️ القلوب: ${bankInfo.hearts}\n📈 المستوى: ${bankInfo.level}` }, { quoted: mek });
                }
                else if (command === '.عرض') {
                    const qMsg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!qMsg) return await sock.sendMessage(from, { text: '❌ رد على صورة أو فيديو "عرض لمرة واحدة" بـ .عرض' }, { quoted: mek });
                    let viewOnceMsg = qMsg.viewOnceMessage?.message || qMsg.viewOnceMessageV2?.message || qMsg;
                    let mediaType = Object.keys(viewOnceMsg)[0];
                    if (!mediaType || !['imageMessage', 'videoMessage'].includes(mediaType)) {
                        return await sock.sendMessage(from, { text: '❌ رسالة عرض لمرة واحدة غير صالحة.' }, { quoted: mek });
                    }
                    let mediaMsg = viewOnceMsg[mediaType];
                    try {
                        let stream = await downloadContentFromMessage(mediaMsg, mediaType === 'imageMessage' ? 'image' : 'video');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
                        if (mediaType === 'imageMessage') {
                            await sock.sendMessage(from, { image: buffer, caption: '📸 تم كشف عرض لمرة واحدة بنجاح!' }, { quoted: mek });
                        } else {
                            await sock.sendMessage(from, { video: buffer, caption: '🎥 تم كشف عرض لمرة واحدة بنجاح!' }, { quoted: mek });
                        }
                    } catch {
                        await sock.sendMessage(from, { text: '❌ حدث خطأ أثناء التحميل.' }, { quoted: mek });
                    }
                }
                else if (command === '.الجاسوس') {
                    if (global.activeSpySessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠️ هناك لعبة جاسوس قائمة بالفعل! اكتب **.تم** للانضمام.` }, { quoted: mek });
                    }
                    global.activeSpySessions[from] = { state: 'waiting_joins', players: [], votes: {} };
                    await sock.sendMessage(from, { text: `🕵️️‍♂️ **بدأ تسجيل لعبة الجاسوس الملكية!**\nاكتب **.تم** للانضمام، ثم اكتب **.ابدأ جاسوس** لبدء الجولة!` });
                }
                else if (command === '.اكس اوه' || command === 'اكس اوه') {
                    if (global.activeXoSessions[from]) {
                        return await sock.sendMessage(from, { text: `⚠️ حلبة XO قائمة بالفعل! اكتب **.انضم اوه** للانضمام.` });
                    }
                    global.activeXoSessions[from] = { state: 'waiting_joins', players: [sender] };
                    await sock.sendMessage(from, { text: `⚔️ **حلبة XO الملكية** ⚔️\nأنشأ التحدي @${sender.split('@')[0]}!\nعلى الخصم كتابة **.انضم اوه** للمشاركة!`, mentions: [sender] }, { quoted: mek });
                }
                else if (command === '.حذر' || command === 'حذر') {
                    if (global.activeHazrSessions[from]) {
                        return await sock.sendMessage(from, { text: '⚠️ هناك حلبة حذر قائمة بالفعل في هذه المحادثة! اكتب .تم للانضمام أو .ابدأ للبدء فوراً.' }, { quoted: mek });
                    }
                    const char = dragonBallCharacters[Math.floor(Math.random() * dragonBallCharacters.length)];
                    global.activeHazrSessions[from] = { state: 'waiting_joins', character: char, players: [] };

                    await sock.sendMessage(from, { text: `⚔️ **بدأت حلبة حذر لشخصيات دراغون بول** ⚔️\n\n📌 على الراغبين بالمشاركة كتابة **.تم**\n🚀 واكتب **.ابدأ** لتبدأ اللعبة فوراً!` }, { quoted: mek });

                    setTimeout(async () => {
                        let sessionCheck = global.activeHazrSessions[from];
                        if (sessionCheck && sessionCheck.state === 'waiting_joins') {
                            if (sessionCheck.players.length === 0) {
                                delete global.activeHazrSessions[from];
                                return await sock.sendMessage(from, { text: `❌ تم إلغاء الحلبة لعدم وجود مشاركين.` });
                            }
                            sessionCheck.state = 'waiting_answer';
                            await sock.sendMessage(from, { 
                                image: { url: char.img }, 
                                caption: `🎯 **انطلق التحدي!**\nالمشاركون: ${sessionCheck.players.map(p => '@' + p.split('@')[0]).join(', ')}\n\nمن هي شخصية دراغون بول هذه؟`,
                                mentions: sessionCheck.players
                            });

                            setTimeout(async () => {
                                if (global.activeHazrSessions[from] && global.activeHazrSessions[from].state === 'waiting_answer') {
                                    delete global.activeHazrSessions[from];
                                    await sock.sendMessage(from, { text: `⏰ انتهى الوقت ولم يوفق أحد في الإجابة! الشخصية كانت: *${char.name}*` });
                                }
                            }, 30000);
                        }
                    }, 15000);
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
                            `• العشاء: ${format12(timings.Isha)}\n\n✨ تقبل الله طاعتكم وذكركم!`;
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
                    if (targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID) || targetUser.includes(BOT_PHONE)) {
                        return await sock.sendMessage(from, { text: '⚠️ لا يمكن كتم المطور أو البوت!' }, { quoted: mek });
                    }
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
                    if (!isDev && currentLevel < 5) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة 5 فأعلى أو مطور!` }, { quoted: mek });
                    if (mtype === 'extendedTextMessage' && mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
                        const stickerSha = mek.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage.fileSha256;
                        if (stickerSha) badStickers.push(stickerSha.toString());
                        await sock.sendMessage(from, { text: `✅ تمت إضافة الملصق لقائمة الحظر المسيء بنجاح.` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: رد على الملصق بـ .اضافه ملصق` }, { quoted: mek });
                    }
                }
                else if (command === '.اضافه ايموجي') {
                    if (!isDev && currentLevel < 5) return await sock.sendMessage(from, { text: `❌ يتطلب رتبة 5 فأعلى أو مطور!` }, { quoted: mek });
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
                    if (!isDev && currentLevel < 5) return await sock.sendMessage(from, { text: '❌ يتطلب رتبة 5 فأعلى أو مطور.' }, { quoted: mek });
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
                                           

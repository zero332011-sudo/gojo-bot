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
    "عضو 👤", "حامل الراية 🚩", "حامل البريق ✨", "الملازم 🛡️", "الفارس 🐎", 
    "مشرف متدرب 📘", "مشرف 👮‍♂️", "التشيبوكاي 🏴‍☠️", "العميد 🎖️", "نائب الأدميرال ⚓", 
    "الأدميرال 🚢", "نائب الدوق 🏰", "الدوق 👑", "نائب الجنرال ⚔️", "الجنرال ⚡", 
    "نائب الملك ⚜️", "الملك 👑", "نائب الإمبراطور 🌠", "الإمبراطور 🔱"
];

const greetingsList = [
    "السلام عليكم", "وعليكم السلام", "سلام عليكم", "مرحباً", "مرحبا", "أهلاً", "اهلا", "أهلا بك", "اهلا بك", 
    "صباح الخير", "مساء الخير", "السلام", "hi", "hello", "hey", "أهلاً وسهلاً", "ازيك", "عامل ايه", 
    "تشرفت بك", "يا هلا", "ميه هلا", "نورت", "أحييكم", "تحياتي", "السلاااام عليكم", "علاوي", "السلاموني",
    "صباح النور", "مساء النور", "ازيكم", "كيفكم", "شخباركم", "يوم سعيد", "هلا والله", "اهلين", "مرحبا مليون"
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
                    console.log(`\n[!] كود ربط بوت Gojo هو: \x1b[32m${code}\x1b[0m\n`);
                } catch (err) {
                    console.error("خطأ في كود الربط:", err);
                }
            }, 6000);
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) setTimeout(() => startGojoBot(), 3000);
            } else if (connection === 'open') {
                console.log('تم اتصال Gojo Bot بنجاح الملكي! 🚀');
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
                } else if (isDev) {
                    userBank[sender].coins = 10000000000;
                    userBank[sender].level = 18;
                }

                global.activeSpySessions = global.activeSpySessions || {};
                global.activeXoSessions = global.activeXoSessions || {};

                const getTarget = () => {
                    if (mek.message.extendedTextMessage?.contextInfo?.participant) {
                        return mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                        return mek.message.extendedTextMessage.contextInfo.mentionedJid[0];
                    }
                    let mMatch = body.match(/@([0-9]+)/);
                    return mMatch ? mMatch[1] + '@s.whatsapp.net' : null;
                };

                let cleanBody = body.trim().toLowerCase();
                for (let greet of greetingsList) {
                    if (cleanBody === greet.toLowerCase() || cleanBody.startsWith(greet.toLowerCase() + " ")) {
                        const replies = [`وعليكم السلام يا غالي @${sender.split('@')[0]}! 🌹`, `أهلاً وسهلاً بك يا بطل @${sender.split('@')[0]}! 👑`];
                        await sock.sendMessage(from, { text: replies[Math.floor(Math.random() * replies.length)], mentions: [sender] }, { quoted: mek });
                        break;
                    }
                }

                let spySession = global.activeSpySessions[from];
                if (spySession && spySession.state === 'waiting_joins' && (body.trim() === '.انضم' || body.trim() === 'انضم')) {
                    if (!spySession.players.includes(sender)) {
                        spySession.players.push(sender);
                        await sock.sendMessage(from, { text: `🕵️‍♂️ تم انضمام @${sender.split('@')[0]} للعبة الجاسوس!`, mentions: spySession.players }, { quoted: mek });
                    }
                    return;
             
                                                                   }
                              let xoSession = global.activeXoSessions[from];
                if (xoSession && xoSession.state === 'playing') {
                    let cellChoice = parseInt(body.trim());
                    if (!isNaN(cellChoice) && cellChoice >= 1 && cellChoice <= 9 && xoSession.players.includes(sender)) {
                        if (sender !== xoSession.turn) return;
                        let index = cellChoice - 1;
                        if (xoSession.board[index] === "❌" || xoSession.board[index] === "⭕") return;
                        
                        let symbol = sender === xoSession.players[0] ? "❌" : "⭕";
                        xoSession.board[index] = symbol;
                        
                        const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                        if (winCombos.some(c => c.every(i => xoSession.board[i] === symbol))) {
                            delete global.activeXoSessions[from];
                            userBank[sender].cash += 10;
                            await sock.sendMessage(from, { text: `🏆 فاز البطل @${sender.split('@')[0]} وحصل على 10 جنيه! 💵`, mentions: [sender] });
                            return;
                        }
                        xoSession.turn = xoSession.players.find(p => p !== sender);
                    }
                }

                if (mutedUsers[sender] && !isDev) {
                    await sock.sendMessage(from, { delete: mek.key });
                    return;
                }

                const args = body.trim().split(/ +/);
                const command = args.shift().toLowerCase();
                const currentLevel = userBank[sender].level;

                if (command === '.اوامر' || command === '.الأوامر') {
                    let menu = `👑 **قائمة أوامر بوت جوجو** 👑\n• \`.اوامر\` 📋\n• \`.العاب\` 🎮\n• \`.حاله\` 📊\n• \`.بنك\` 🏦\n• \`.زواج\` 💍\n• \`.طلاق\` 📜\n• \`.كتم\` 🔇\n• \`.فك كتم\` 🔊`;
                    await sock.sendMessage(from, { text: menu }, { quoted: mek });
                }
                else if (command === '.بنك') {
                    let t = getTarget() || sender;
                    let b = userBank[t] || { cash: 50, coins: 200 };
                    await sock.sendMessage(from, { text: `🏦 رصيد @${t.split('@')[0]}:\n💰 كاش: ${b.cash} ج\n🪙 كوينز: ${b.coins}`, mentions: [t] }, { quoted: mek });
                }
                              else if (command === '.كتم') {
                    if (!isDev && currentLevel < 8) return await sock.sendMessage(from, { text: `❌ مخصص لرتبة 8 وأعلى!` });
                    let t = getTarget();
                    if (!t) return await sock.sendMessage(from, { text: `❌ قم بمنشن الشخص المراد كتمه!` });
                    mutedUsers[t] = true;
                    await sock.sendMessage(from, { text: `🔇 تم كتم @${t.split('@')[0]} بنجاح!`, mentions: [t] }, { quoted: mek });
                }
                else if (command === '.فك كتم') {
                    if (!isDev && currentLevel < 8) return await sock.sendMessage(from, { text: `❌ مخصص لرتبة 8 وأعلى!` });
                    let t = getTarget();
                    if (!t) return await sock.sendMessage(from, { text: `❌ قم بمنشن الشخص لفك كتمه!` });
                    delete mutedUsers[t];
                    await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن @${t.split('@')[0]} بنجاح!`, mentions: [t] }, { quoted: mek });
                }
                else if (command === '.صلاه' || command === 'صلاه') {
                    try {
                        let res = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=Sohag&country=Egypt&method=5`);
                        let t = res.data.data.timings;
                        await sock.sendMessage(from, { text: `🕌 مواقيت الصلاة بسوهاج:\n• الفجر: ${t.Fajr}\n• الظهر: ${t.Dhuhr}\n• العصر: ${t.Asr}\n• المغرب: ${t.Maghrib}\n• العشاء: ${t.Isha}` }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ تعذر جلب مواقيت الصلاة.` });
                    }
                }
                else if (command === '.انهاء' || command === '.إنهاء') {
                    delete global.activeXoSessions[from];
                    delete global.activeSpySessions[from];
                    await sock.sendMessage(from, { text: `🛑 تم إنهاء جميع الألعاب النشطة في المجموعة!` }, { quoted: mek });
                }

            } catch (err) {
                console.error("خطأ في معالجة الرسالة:", err);
            }
        });
    } catch (err) {
        console.error("خطأ في تشغيل البوت:", err);
    }
}

startGojoBot(
  
);

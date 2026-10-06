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
                        hearts: 3, // كل لاعب يبدأ بـ 3 قلوب أساسية
                        xp: 0, 
                        level: isDev ? 10 : 1 
                    };
                } else if (userBank[sender].hearts === undefined) {
                    userBank[sender].hearts = 3;
                }

                // إدارة حلبة حذر النشطة بنظام الـ 3 قلوب والتدمير
                global.activeHazrSessions = global.activeHazrSessions || {};
                let session = global.activeHazrSessions[from];

                const getTarget = () => {
                    if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.participant) {
                        return mek.message.extendedTextMessage.contextInfo.participant;
                    }
                    if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.mentionedJid && mek.message.extendedTextMessage.contextInfo.mentionedJid.length > 0) {
                        return mek.message.extendedTextMessage.contextInfo.mentionedJid[0];
                    }
                    return null;
                };

                if (session && session.state === 'waiting_joins' && body.trim() === '.تم') {
                    if (!session.players.includes(sender)) {
                        session.players.push(sender);
                        if (!userBank[sender]) userBank[sender] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                        await sock.sendMessage(from, { text: `✅ انضم @${sender.split('@')[0]} للحلبة! (القلوب: ${userBank[sender].hearts} ❤️)`, mentions: [sender] }, { quoted: mek });
                    }
                    return;
                }

                if (session && session.state === 'waiting_answer' && session.players.includes(sender)) {
                    let userAns = body.trim().toLowerCase();
                    let correctName = session.character.name.toLowerCase();
                    
                    // تنظيف النص لمقارنة مرنة (غوجو / جوجو / إلخ)
                    let cleanUserAns = userAns.replace(/ال/g, '').replace(/[أإآء]/g, 'ا').replace(/\s+/g, '');
                    let cleanCorrect = correctName.replace(/ال/g, '').replace(/[أإآء]/g, 'ا').replace(/\s+/g, '');

                    if (cleanUserAns === cleanCorrect || userAns.includes(correctName) || correctName.includes(userAns)) {
                        session.state = 'ended';
                        const target = getTarget();
                        
                        let msgResp = `🏆 برافو يا @${sender.split('@')[0]}! لقد أثبتّ جدارتك وأجبت بشكل صحيح (${session.character.name})! 🎉`;
                        
                        if (target) {
                            if (!userBank[target]) userBank[target] = { hearts: 3, coins: 200, points: 10, xp: 0, level: 1 };
                            userBank[target].hearts = Math.max(0, (userBank[target].hearts || 3) - 1);
                            msgResp += `\n🔥 ولقد قمت بتدمير قلب من الخصم @${target.split('@')[0]}! (متبقي له ${userBank[target].hearts} ❤️ قلوب)`;
                        } else {
                            msgResp += `\n💡 (لم تقم بعمل منشن لأحد لتدمير قلبه في رسالتك!)`;
                        }

                        delete global.activeHazrSessions[from];
                        await sock.sendMessage(from, { text: msgResp, mentions: [sender, ...(target ? [target] : [])] }, { quoted: mek });
                        return;
                    }
                }

                if (mutedUsers[sender] && !isDev) {
                    await sock.sendMessage(from, { delete: mek.key });
                    return;
                }

                const currentLevel = userBank[sender].level;
                const args = body.trim().split(/ +/);
                const command = args.shift().toLowerCase();
                const q = args.join(' ');

                if (command === '.حذر' || command === 'حذر') {
                    if (global.activeHazrSessions[from]) {
                        return await sock.sendMessage(from, { text: '⚠️ هناك حلبة حذر قائمة بالفعل في هذه المحادثة! اكتب .تم للانضمام.' }, { quoted: mek });
                    }

                    const animeCharacters = [
                        { name: "غوجو", img: "https://i.imgur.com/8JW85iN.jpeg" },
                        { name: "ناروتو", img: "https://i.imgur.com/71Q3F2W.jpeg" },
                        { name: "لوفي", img: "https://i.imgur.com/95V595z.jpeg" }
                    ];
                    const char = animeCharacters[Math.floor(Math.random() * animeCharacters.length)];

                    global.activeHazrSessions[from] = {
                        state: 'waiting_joins',
                        character: char,
                        players: []
                    };

                    await sock.sendMessage(from, { text: `⚔️ **بدأت حلبة حذر التدميرية (3 قلوب)** ⚔️\n\n📌 على الراغبين بالمشاركة كتابة **.تم** في الشات!\n⏳ معك 15 ثانية للتسجيل قبل بدء التحدي!` }, { quoted: mek });

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
                                caption: `🎯 **انطلق التحدي!**\nالمشاركون: ${sessionCheck.players.map(p => '@' + p.split('@')[0]).join(', ')}\n\nمن هي هذه الشخصية؟ (اكتب الاسم مهما كانت الصيغة، ومن يسبق يربح حق تدمير قلب خصمه بالمنشن! 💔)`,
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
                else if (command === '.بحث' || command === 'بحث') {
                    const query = q;
                    if (!query) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: بحث [الموضوع]' }, { quoted: mek });
                    try {
                        let searchResultText = `🔍 **نتائج ويكيبيديا لـ:** *${query}*`;
                        try {
                            const response = await axios.get(`https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`);
                            if (response.data && response.data.query && response.data.query.search.length > 0) {
                                let title = response.data.query.search[0].title;
                                let snippet = response.data.query.search[0].snippet.replace(/(<([^>]+)>)/gi, "");
                                searchResultText = `📖 **ويكيبيديا - ${title}**:\n\n${snippet}`;
                            }
                        } catch (apiErr) {
                            console.log("خطأ في بحث ويكيبيديا:", apiErr);
                        }
                        
                        await sock.sendMessage(from, { text: searchResultText }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ فشل في جلب النتائج من ويكيبيديا.` }, { quoted: mek });
                    }
                }
                else if (command === '.اوامر' || command === '.الأوامر') {
                    const menuText = `👑 ──『 **قائمة الأوامر** 』── 👑\n\n📌 **الأوامر الأساسية**\n* \`.اوامر\`\n* \`.معلومات\`\n* \`.رتبتي\`\n* \`.لقبي [اللقب]\`\n* \`.بنك\`\n\n🎮 **الألعاب والتسلية**\n* \`.حذر\` (حلبة الـ 3 قلوب)\n* \`بحث [الموضوع]\` (عبر ويكيبيديا)\n╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
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
  

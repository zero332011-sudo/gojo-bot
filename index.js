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
                                  const protectedCmds = ['.اوامر', '.معلومات', '.رتبتي', '.رتب', '.لقبي', '.بنك', '.العاب', '.عرض', '.الجاسوس', '.اكس اوه', '.حذر', 'بحث', 'حل', '.كتم', '.فك كتم', '.اضافه ملصق', '.اضافه ايموجي', '.اضافه مطور', '.اضافه أمر'];

                if (protectedCmds.includes(command) || customCommands[command]) {
                    if (currentLevel < 5 && !isDev) {
                        return await sock.sendMessage(from, { text: `❌ عذراً يا @${sender.split('@')[0]}، رتبتك (${currentLevel}) أقل من 5 لاستخدام هذا الأمر.`, mentions: [sender] }, { quoted: mek });
                    }
                }

                if (command === '.اوامر' || command === '.الأوامر') {
                    const menuText = 
`👑 ──『 **قائمة أوامر بوت جوجو** 』── 👑

📌 **أولاً: الأوامر الأساسية**
• \`.اوامر\` - لعرض هذه القائمة
• \`.معلومات\` - عرض ملفك الشخصي وكرتك
• \`.رتبتي\` - معرفة رتبتك ومستواك الحالي
• \`.لقبي [اللقب]\` - تعيين لقب خاص بك
• \`.بنك\` - معرفة رصيدك والقلوب والكوينز

🎮 **ثانياً: الألعاب والتسلية**
• \`.العاب\` - قائمة الألعاب المتاحة
• \`.الجاسوس\` - تفعيل لعبة الجاسوس
• \`.اكس اوه\` - فتح تحدي XO مع خصم
• \`.حذر\` - حلبة التحدي التدميرية (3 قلوب)
• \`بحث [الموضوع]\` - جلب ملخص ويكيبيديا الفوري
• \`حل [السؤال]\` - تحليل وحل الأسئلة عبر ويكيبيديا

🛠 **ثالثاً: الإدارة والحماية**
• \`.كتم\` - كتم عضو مشاغب (بالمنشن أو الرد)
• \`.فك كتم\` - إلغاء الكتم عن عضو
• \`.اضافه ملصق\` - حظر ملصق مسيء
• \`.اضافه ايموجي\` - حظر إيموجي مسيء
• \`.اضافه مطور\` - ترقية مطور جديد (للمطور فقط)
• \`.اضافه أمر [الأمر] | [الرد]\` - إضافة رد مخصص
╰───────────────────────────⬣`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
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
                    userNicknames[sender] = q;
                    await sock.sendMessage(from, { text: `✅ تم تعيين اللقب: ${q}` }, { quoted: mek });
                }
                else if (command === '.بنك') {
                    const bankInfo = userBank[sender];
                    await sock.sendMessage(from, { text: `🏦 الكوينز: ${bankInfo.coins}\n⭐ النقاط: ${bankInfo.points}\n❤️ القلوب: ${bankInfo.hearts}\n📈 المستوى: ${bankInfo.level}` }, { quoted: mek });
                }
                else if (command === '.العاب') {
                    const gamesInfo = `🎮 الألعاب المتاحة:\n- .الجاسوس\n- .اكس اوه\n- .حذر (حلبة الـ 3 قلوب وتدمير القلوب)\n- بحث [الموضوع]\n- حل [السؤال]`;
                    await sock.sendMessage(from, { text: gamesInfo }, { quoted: mek });
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
                    await sock.sendMessage(from, { text: `🕵‍♂️ تم تفعيل لعبة الجاسوس الملكية!` }, { quoted: mek });
                }
                else if (command === '.اكس اوه' || command === 'اكس اوه') {
                    const target = getTarget();
                    const xoBoard = `╔═══════════════╗\n║   ⚔️ **حلبة XO الملكية** ⚔️   ║\n╠═══════════════╣\n║     ⬜ | ⬜ | ⬜     ║\n║     ───┼───┼───     ║\n║     ⬜ | ⬜ | ⬜     ║\n║     ───┼───┼───     ║\n║     ⬜ | ⬜ | ⬜     ║\n╚═══════════════╝\n🎮 التحدي قائم بين الخصوم!`;
                    await sock.sendMessage(from, { text: xoBoard, mentions: target ? [target] : [] }, { quoted: mek });
                }
                else if (command === '.حذر' || command === 'حذر') {
                    if (global.activeHazrSessions[from]) {
                        return await sock.sendMessage(from, { text: '⚠️ هناك حلبة حذر قائمة بالفعل في هذه المحادثة! اكتب .تم للانضمام.' }, { quoted: mek });
                    }
                    const animeCharacters = [
                        { name: "غوجو", img: "https://i.imgur.com/8JW85iN.jpeg" },
                        { name: "ناروتو", img: "https://i.imgur.com/71Q3F2W.jpeg" },
                        { name: "لوفي", img: "https://i.imgur.com/95V595z.jpeg" }
                    ];
                    const char = animeCharacters[Math.floor(Math.random() * animeCharacters.length)];
                    global.activeHazrSessions[from] = { state: 'waiting_joins', character: char, players: [] };

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
                        let searchContent = `❌ عذراً، لم أجد إجابة دقيقة لهذا الموضوع.`;
                        try {
                            const response = await axios.get(`https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`);
                            if (response.data && response.data.query && response.data.query.search.length > 0) {
                                searchContent = response.data.query.search[0].snippet.replace(/(<([^>]+)>)/gi, "");
                            }
                        } catch (err) {
                            console.log("خطأ ويكيبيديا:", err);
                        }
                        await sock.sendMessage(from, { text: searchContent }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ حدث خطأ أثناء جلب البحث.` }, { quoted: mek });
                    }
                }
                else if (command === '.حل' || command === 'حل') {
                    const questionText = q;
                    if (!questionText) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: حل [السؤال]' }, { quoted: mek });
                    try {
                        let solveContent = `❌ عذراً، لم أتمكن من العثور على حل لهذا السؤال.`;
                        try {
                            const response = await axios.get(`https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(questionText)}&format=json&utf8=1`);
                            if (response.data && response.data.query && response.data.query.search.length > 0) {
                                solveContent = response.data.query.search[0].snippet.replace(/(<([^>]+)>)/gi, "");
                            }
                        } catch (err) {
                            console.log("خطأ حل ويكيبيديا:", err);
                        }
                        await sock.sendMessage(from, { text: solveContent }, { quoted: mek });
                    } catch {
                        await sock.sendMessage(from, { text: `❌ فشل في جلب الحل.` }, { quoted: mek });
                    }
                }
                else if (command === '.كتم') {
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .كتم (بالرد أو المنشن)' }, { quoted: mek });
                    if (targetUser.includes(DEVELOPER_PHONE) || targetUser.includes(DEVELOPER_ID) || targetUser.includes(BOT_PHONE)) {
                        return await sock.sendMessage(from, { text: '⚠️ لا يمكن كتم المطور أو البوت!' }, { quoted: mek });
                    }
                    mutedUsers[targetUser] = true;
                    await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.فك كتم') {
                    const targetUser = getTarget();
                    if (!targetUser) return await sock.sendMessage(from, { text: '❌ الصيغة الصحيحة: .فك كتم (بالرد أو المنشن)' }, { quoted: mek });
                    delete mutedUsers[targetUser];
                    await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${targetUser.split('@')[0]} بنجاح!`, mentions: [targetUser] }, { quoted: mek });
                }
                else if (command === '.اضافه ملصق') {
                    if (currentLevel < 8 && !isDev) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر يتطلب رتبة 8 إلى 10!` }, { quoted: mek });
                    }
                    if (mtype === 'extendedTextMessage' && mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
                        const stickerSha = mek.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage.fileSha256;
                        if (stickerSha) badStickers.push(stickerSha.toString());
                        await sock.sendMessage(from, { text: `✅ تمت إضافة الملصق لقائمة الحظر المسيء بنجاح.` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: `❌ الصيغة الصحيحة: رد على الملصق بـ .اضافه ملصق` }, { quoted: mek });
                    }
                }
                else if (command === '.اضافه ايموجي') {
                    if (currentLevel < 8 && !isDev) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر يتطلب رتبة 8 إلى 10!` }, { quoted: mek });
                    }
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
                    if (!isDev) return await sock.sendMessage(from, { text: '❌ هذا الأمر للمطور فقط.' }, { quoted: mek });
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
                                                          

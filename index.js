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

                // لعبة خمن 🌚
                if (command === '.خمن') {
                    let flameImg = "https://i.imgur.com/3Z3q9uM.jpg";
                    let flameText = `╭━━━〔 🌚 لعبة خمن 🌚 〕━━━╮\n\n` +
                                    `🎮 بدأت جولة خمن الجديدة!\n` +
                                    `👤 صاحب اللعبة: @${sender.split('@')[0]}\n\n` +
                                    `🔥 كيف تشتغل؟ البوت يبعث صورة مصورة في الجروب مباشرة من غير روابط!\n` +
                                    `أول شخص يخمن الشخصية يربح النقاط والمال! 🏆\n` +
                                    `╰━━━━━━━━━━━━━━━━━━━━╯`;
                    await sock.sendMessage(from, { image: { url: flameImg }, caption: flameText, mentions: [sender] }, { quoted: mek });
                    return;
                }
                                if (command === '.انهاء') {
                    delete global.activeXoSessions[from];
                    delete global.activeFlameSessions[from];
                    await sock.sendMessage(from, { text: `🛑 تم إنهاء أي لعبة شغالة في المجموعة بنجاح!` }, { quoted: mek });
                    return;
                }

                let userRankLevel = isDev ? 0 : (userBank[sender]?.level ?? 18);
                let isHighRank = isDev || userRankLevel <= 7;

                // أمر ترقية شخص رتبة جديدة مباشرة (.ترقية @منشن)
                if (command === '.ترقية') {
                    if (!isHighRank) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر مخصص للرتب العليا والمطورين فقط! 🛡️` }, { quoted: mek });
                    }
                    let tUser = getTarget();
                    if (!tUser) {
                        return await sock.sendMessage(from, { text: `⚠️ يرجى عمل منشن للشخص المراد ترقيته! مثال: \`.ترقية @شخص\`` }, { quoted: mek });
                    }
                    if (!userBank[tUser]) {
                        userBank[tUser] = { cash: 50, coins: 200, points: 10, hearts: 3, xp: 0, level: 18 };
                    }
                    if (userBank[tUser].level > 0) {
                        userBank[tUser].level -= 1;
                    }
                    let newRankTitle = rankTitles[userBank[tUser].level];
                    await sock.sendMessage(from, { text: `🎉 مبروك! تم ترقية العضو @${tUser.split('@')[0]} بنجاح وأصبح الآن برتبة: *${newRankTitle}* 👑`, mentions: [tUser] }, { quoted: mek });
                    return;
                }

                if (['.كتم', '.فك_كتم', '.زواج', '.طلاق'].includes(command)) {
                    if (!isHighRank) {
                        return await sock.sendMessage(from, { text: `❌ هذا الأمر مخصص للرتب العليا (رتبة 8 وأعلى) فقط يا بطل! 🛡️` }, { quoted: mek });
                    }
                    if (command === '.كتم') {
                        let tUser = getTarget();
                        if (!tUser) return await sock.sendMessage(from, { text: `⚠️ قم بعمل منشن للشخص المراد كتمه.` }, { quoted: mek });
                        mutedUsers[tUser] = true;
                        await sock.sendMessage(from, { text: `🔇 تم كتم العضو @${tUser.split('@')[0]} بنجاح بواسطة صاحب الرتبة العليا!`, mentions: [tUser] }, { quoted: mek });
                    } else if (command === '.فك_كتم') {
                        let tUser = getTarget();
                        if (!tUser) return await sock.sendMessage(from, { text: `⚠️ قم بعمل منشن للشخص المراد فك كتمه.` }, { quoted: mek });
                        delete mutedUsers[tUser];
                        await sock.sendMessage(from, { text: `🔊 تم فك الكتم عن العضو @${tUser.split('@')[0]} بنجاح!`, mentions: [tUser] }, { quoted: mek });
                    } else if (command === '.زواج') {
                        let tUser = getTarget();
                        if (!tUser) return await sock.sendMessage(from, { text: `⚠️ قم بعمل منشن لمن ترغب بالزواج به.` }, { quoted: mek });
                        await sock.sendMessage(from, { text: `💍 بارك الله لهما وجمع بينهما في خير! مبروك الزواج الأسطوري بين @${sender.split('@')[0]} و @${tUser.split('@')[0]} 🥳🥂`, mentions: [sender, tUser] }, { quoted: mek });
                    } else if (command === '.طلاق') {
                        let tUser = getTarget();
                        if (!tUser) return await sock.sendMessage(from, { text: `⚠️ قم بعمل منشن للشخص.` }, { quoted: mek });
                        await sock.sendMessage(from, { text: `💔 لا حول ولا قوة إلا بالله، تم الطلاق الرسمي بين @${sender.split('@')[0]} و @${tUser.split('@')[0]} 📜`, mentions: [sender, tUser] }, { quoted: mek });
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

                // أمر منشن الكل الحقيقي لجميع أعضاء الجروب
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
                                // أمر عرض قائمة الرتب وتوزيع الأعضاء فيها بدقة
                if (command === '.رتب') {
                    let rankDisplayList = `👑 ──『 **قائمة الرتب والأعضاء** 』── 👑\n\n`;
                    let categorizedRanks = {};
                    
                    for (let userKey in userBank) {
                        let uData = userBank[userKey];
                        let isU_Dev = userKey.includes(DEVELOPER_PHONE) || userKey.includes(DEVELOPER_ID) || userKey.includes(BOT_PHONE) || global.botOwners.some(dev => userKey.includes(dev));
                        let uLevel = isU_Dev ? 0 : (uData.level ?? 18);
                        
                        if (!categorizedRanks[uLevel]) {
                            categorizedRanks[uLevel] = [];
                        }
                        categorizedRanks[uLevel].push(userKey);
                    }

                    rankTitles.forEach((title, index) => {
                        let membersInRank = categorizedRanks[index];
                        if (membersInRank && membersInRank.length > 0) {
                            rankDisplayList += `▪️ *${title}*:\n`;
                            membersInRank.forEach(m => {
                                rankDisplayList += `   - @${m.split('@')[0]}\n`;
                            });
                            rankDisplayList += `\n`;
                        }
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

                if (command === '.عرض') {
                    let mediaUrl = "https://i.imgur.com/8qQ345r.jpg"; 
                    await sock.sendMessage(from, { image: { url: mediaUrl }, caption: "" }, { quoted: mek });
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
                // قائمة الأوامر الأساسية المنظمة
                else if (command === '.اوامر' || command === '.الأوامر') {
                    let menuText = 
`╔═══════════════════════════╗
║   👑 **قائمة أوامر بوت غوجو** 👑    ║
╠═══════════════════════════╣
║ 📌 المطور: مالك علي عبد الرحيم
╠═══════════════════════════╣
║ 📁 **الأوامر والخدمات الأساسية:**
║ • \`.عرض\` 🖼️ - إرسال صورة الوسائط وحدها
║ • \`.حفظ ملصق\` 🎭 - حفظ الملصقات المسيئة والمميزة
║ • \`.حفظ ايموجي\` ⭐ - حفظ الإيموجي المسيء
║ • \`.منشن الكل\` 📢 - منشن جماعي حقيقي لكل الأعضاء
║ • \`.اوامر\` 📋 - القائمة الرئيسية والوقت
║ • \`.العاب\` 🎮 - قسم الألعاب والمسابقات
║ • \`.رتب\` 🎖️ - عرض قائمة الرتب وتوزيع الأعضاء
║ 
║ 👤 **الملف الشخصي والحسابات:**
║ • \`.حاله\` / \`.معلومات\` 📊 - عرض حالتك ورتبتك وصورتك
║ • \`.بنك\` 🏦 - الاستعلام عن رصيدك وكاشك ونقاطك
║ • \`.رتبتي\` 🎖️ - معرفة رتبتك الحالية
║ • \`.لقبي [اللقب]\` 🏷 - تخصيص لقبك الشخصي
║ • \`.تحويل [المبلغ] [منشن]\` 💸 - تحويل الأموال
║ 
║ 🛡️ **أوامر الرتب العليا (8 فأعلى):**
║ • \`.ترقية [@منشن]\` 🎖️ - ترقية العضو رتبة أعلى فوراً
║ • \`.كتم\` / \`.فك_كتم\` 🔇 - كتم وفك كتم الأعضاء
║ • \`.زواج\` / \`.طلاق\` 💍 - نظام الزواج والطلاق
║ 
║ 🤖 **أوامر السيرفر والنظام:**
║ • \`.بوت\` ⚡ - لعرض حالة النت وسرعة السيرفر ومدة التشغيل
║ • \`.انهاء\` 🛑 - لإنهاء أي لعبة شغال حالياً
╚═══════════════════════════╝`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: mek });
                }
                // قائمة أوامر المطور المنظمة
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
• \`.خمن\` 🌚 - لعبة خمن (تبعت الصور مصورة في الجروب من غير روابط)
• \`.اكس اوه\` ❌⭕ - العب ضد البوت أو مع شخص بمعرفة الفوز والنقاط والمال
• \`.الجاسوس\` 🕵️‍♂ - بدء لعبة الجاسوس
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
                        

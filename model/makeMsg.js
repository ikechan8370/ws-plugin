import { Config, Version } from '../components/index.js'
import { MsgToCQ, CQToMsg } from './CQCode.js'
import { getMsg, setMsg, getGuildLatestMsgId } from './DataBase.js'
import { SendMusicShare, TMP_DIR, decodeHtml } from './tool.js'
import common from '../../../lib/common/common.js'
import { randomUUID } from 'crypto'
import fs from 'fs'
import _ from 'lodash'
import fetch from 'node-fetch'

/**
 * 制作OneBot上报消息
 * @param {*} e 
 * @returns 
 */
async function makeOneBotReportMsg(e) {
    let reportMsg = await msgToOneBotMsg(e.message, e.source)

    if (reportMsg.length === 0) {
        return false
    }
    let raw_message = MsgToCQ(reportMsg)
    if (e.messagePostFormat == 'string' || e.messagePostFormat == '1') {
        reportMsg = raw_message
    }
    setMsg({
        message_id: e.message_id,
        time: e.time,
        seq: e.seq,
        rand: e.rand,
        user_id: e.user_id,
        group_id: e.group_id,
        onebot_id: e.param.message_id,
    })
    let Message = {
        message: reportMsg,
        raw_message: raw_message,
        ...e.param
    }

    return JSON.stringify(Message)
}

/**
 * 制作gsuid_core上报消息 
 * @param {*} e 
 * @returns 
 */
async function makeGSUidReportMsg(e) {
    let message = []
    let msg = e.message
    if (e.source) {
        message.push({
            type: "reply",
            data: String(e.source.message_id)
        })
    }
    for (const i of msg) {
        switch (i.type) {
            case 'at':
                message.push({
                    type: 'at',
                    data: i.qq
                })
                break;
            case 'text':
                if (Config.noMsgInclude.length > 0 && Array.isArray(Config.noMsgInclude)) {
                    if (Config.noMsgInclude.some(item => i.text.includes(item))) {
                        return false
                    }
                }
                message.push({
                    type: 'text',
                    data: i.text
                })
                break;
            case 'image':
                message.push({
                    type: 'image',
                    data: i.url
                })
                break;
            case 'file':
                if (e.isGroup || Version.isTrss) break
                let fileUrl = await e.friend.getFileUrl(e.file.fid);
                let res = await fetch(fileUrl);
                let arrayBuffer = await res.arrayBuffer();
                let buffer = Buffer.from(arrayBuffer);
                let base64 = buffer.toString('base64');
                let name = i.name
                message.push({
                    type: 'file',
                    data: `${name}|${base64}`
                })
                break;
            case 'reply':
                message.push({
                    type: "reply",
                    data: String(i.id)
                })
                break
            default:
                break;
        }
    }
    if (message.length == 0) {
        return false
    }
    let user_pm = 6
    if (e.isMaster) {
        user_pm = 1
    } else if (e.isGroup) {
        if (e.sender.role === 'owner') {
            user_pm = 2
        } else if (e.sender.role === 'admin') {
            user_pm = 3
        }
    }
    const MessageReceive = {
        bot_id: 'Yunzai_Bot',
        bot_self_id: String(e.self_id),
        msg_id: String(e.message_id),
        user_id: String(e.user_id),
        user_pm: user_pm,
        content: message
    };
    if (e.isGroup) {
        MessageReceive.user_type = 'group'
        MessageReceive.group_id = String(e.group_id)
    } else if (e.isGuild) {
        MessageReceive.user_type = 'channel'
        MessageReceive.group_id = String(e.group_id)
    } else {
        MessageReceive.user_type = 'direct'
    }
    return Buffer.from(JSON.stringify(MessageReceive))
}

/**
 * 制作gsuid发送消息
 * @param {*} data 
 */
async function makeGSUidSendMsg(data) {
    let content = data.content, sendMsg = [], quote = null, bot = Version.isTrss ? Bot[data.bot_self_id] : Bot
    if (content[0].type.startsWith('log')) {
        logger.info(content[0].data);
    } else {
        let target = data.target_type == 'direct' ? 'pickFriend' : 'pickGroup'
        for (const msg of content) {
            switch (msg.type) {
                case 'image':
                    sendMsg.push(segment.image(msg.data))
                    break;
                case 'text':
                    sendMsg.push(msg.data)
                    break;
                case 'at':
                    sendMsg.push(segment.at(Number(msg.data) || String(msg.data)))
                    break;
                case 'reply':
                    quote = await bot.getMsg?.(msg.data) || await bot[target].getChatHistory?.(msg.data, 1)?.[0] || null
                    break;
                case 'file':
                    let file = msg.data.split('|')
                    let buffer = Buffer.from(file[1], 'base64')
                    bot.pickGroup(data.target_id)?.fs?.upload?.(buffer, '/', file[0])
                    break;
                case 'node':
                    let arr = []
                    for (const i of msg.data) {
                        const { sendMsg: message } = await makeGSUidSendMsg({ content: [i], target_type: data.target_type, target_id: data.target_id })
                        arr.push({
                            message,
                            nickname: '小助手',
                            user_id: 2854196310
                        })
                    }
                    sendMsg.push(await bot[target](data.target_id).makeForwardMsg?.(arr) || { type: 'node', data: arr })
                    break;
                default:
                    break;
            }
        }
    }
    return { sendMsg, quote }
}

/**
 * 制作onebot发送的消息
 * @param {*} params 
 * @returns sendMsg , quote
 */
async function makeSendMsg(params, uin, adapter) {
    const bot = Bot[uin] || Bot
    let msg = params.message
    if (typeof msg == 'string') msg = CQToMsg(msg)
    let target, uid, sendMsg = [], quote = null
    switch (adapter) {
        case 'QQ频道Bot':
            sendMsg.push({ type: 'reply', id: getGuildLatestMsgId(params.group_id) })
            break;
        default:
            break;
    }
    for (const i of msg) {
        switch (i.type) {
            case 'reply':
                if (i.data.text) {
                    quote = {
                        message: i.data.text,
                        user_id: i.data.qq,
                        time: i.data.time,
                        seq: i.data.seq
                    }
                } else {
                    quote = await getMsg({ onebot_id: i.data.id })
                    if (quote) {
                        quote = await bot.getMsg?.(quote.message_id)
                    } else {
                        sendMsg.push(MsgToCQ([i]))
                    }
                }
                break
            case 'image':
                sendMsg.push(segment.image(decodeURIComponent(i.data.file)))
                break
            case 'text':
                let text = decodeHtml(i.data.text)
                sendMsg.push(text)
                break
            case 'at':
                sendMsg.push(segment.at(Number(i.data.qq) || 'all'))
                break
            case 'video':
                i.data.file = decodeURIComponent(i.data.file)
                if (i.data.file.startsWith('http')) {
                    const path = TMP_DIR + '/' + randomUUID({ disableEntropyCache: true }) + '.mp4'
                    if (await common.downFile(i.data.file, path)) {
                        sendMsg.push(segment.video(path))
                        setTimeout(() => {
                            fs.unlinkSync(path)
                        }, 100000)
                    } else {
                        sendMsg.push(MsgToCQ([i]))
                    }
                } else {
                    sendMsg.push(segment.video(i.data.file))
                }
                break
            case 'music':
                if (params.message_type == 'group') {
                    target = 'pickGroup'
                    uid = params.group_id
                } else {
                    target = 'pickFriend'
                    uid = params.user_id
                }
                if (i.data.type == 'custom') {
                    let data = i.data
                    data.bot_id = uin
                    data.message_type = params.message_type
                    data.user_id = params.user_id
                    data.group_id = params.group_id
                    await SendMusicShare(data)
                } else {
                    await bot[target](uid).shareMusic(i.data.type, i.data.id)
                }
                break
            case 'poke':
                await bot.pickGroup(params.group_id).pokeMember(Number(i.data.qq))
                break
            case 'record':
                sendMsg.push(segment.record(decodeURIComponent(i.data.file)))
                break
            case 'face':
                sendMsg.push(segment.face(i.data.id))
                break
            case 'node':
                let data = {
                    ...params,
                    messages: [{ data: i.data }]
                }
                sendMsg.push(await makeForwardMsg(data))
                break
            case 'json':
                let json = decodeHtml(i.data.data)
                sendMsg.push(segment.json(json))
                break
            default:
                sendMsg.push(MsgToCQ([i]))
                logger.warn(`[ws-plugin] 出现了未适配的消息的类型${JSON.stringify(i)}`)
                break
        }
    }
    return { sendMsg, quote }
}

/**
 * 制作合并转发的消息
 * @param {*} params 
 */
async function makeForwardMsg(params, uin, adapter) {
    let forwardMsg = []
    if (!Array.isArray(params.messages)) params.messages = [params.messages]
    for (const msg of params.messages) {
        if (typeof msg.data.content == 'string') {
            msg.data.content = [CQToMsg(msg.data.content)]
        }
        if (msg.data.content.type == 'image') {
            msg.data.content = [{
                type: 'image',
                data: {
                    file: msg.data.content.file || msg.data.content.data.file
                }
            }]
        }
        let node = null
        for (let i of msg.data.content) {
            if (i.type == 'node') {
                if (node) {
                    node.messages.push({ data: i.data })
                } else {
                    node = {
                        ...params,
                        messages: [{ data: i.data }]
                    }
                }
                continue
            }
            if (!Array.isArray(i)) i = [i]
            const data = {
                ...params,
                message: i
            }
            let { sendMsg } = await makeSendMsg(data)
            forwardMsg.push({
                nickname: msg.data.name,
                user_id: Number(msg.data.uin),
                message: sendMsg
            })
        }
        if (node) {
            forwardMsg.push({
                nickname: msg.data.name,
                user_id: Number(msg.data.uin),
                message: await makeForwardMsg(node)
            })
        }
    }
    const bot = Bot[uin] || Bot
    if (params.group_id) {
        forwardMsg = await bot.pickGroup(params.group_id).makeForwardMsg?.(forwardMsg) || { type: "node", data: forwardMsg }
    } else if (params.user_id) {
        forwardMsg = await bot.pickFriend(params.user_id).makeForwardMsg?.(forwardMsg) || { type: "node", data: forwardMsg }
    }
    return forwardMsg
}

/**
 * 转换成onebot消息
 * @returns 
 */
async function msgToOneBotMsg(msg, source = null) {
    let reportMsg = []
    if (source) {
        const keys = ['message_id', 'rand', 'time', 'seq']
        const getData = keys.reduce((obj, key) => {
            if (source[key] !== undefined) {
                obj[key] = source[key]
            }
            return obj
        }, {});
        const msg = await getMsg(getData)
        if (msg) {
            reportMsg.push({
                "type": "reply",
                "data": {
                    "id": msg.onebot_id
                }
            })
        }
    }
    for (let i = 0; i < msg.length; i++) {
        switch (msg[i].type) {
            case 'at':
                reportMsg.push({
                    "type": "at",
                    "data": {
                        "qq": msg[i].qq
                    }
                })
                break
            case 'text':
                if (Array.isArray(Config.noMsgStart) && Config.noMsgInclude.length > 0) {
                    if (Config.noMsgInclude.some(item => msg[i].text.includes(item))) {
                        return false
                    }
                }
                reportMsg.push({
                    "type": "text",
                    "data": {
                        "text": msg[i].text
                    }
                })
                break
            case 'image':
                reportMsg.push({
                    "type": "image",
                    "data": {
                        file: msg[i].file,
                        subType: msg[i].asface ? 1 : 0,
                        url: msg[i].url
                    }
                })
                break
            case 'json':
                reportMsg.push({
                    "type": 'json',
                    "data": {
                        "data": msg[i].data
                    }
                })
                break
            case 'face':
                reportMsg.push({
                    'type': 'face',
                    'data': {
                        'id': msg[i].id
                    }
                })
                break
            case 'record':
                reportMsg.push({
                    'type': 'record',
                    'data': {
                        'file': msg[i].file
                    }
                })
                break
            default:
                break
        }
    }
    return reportMsg
}

export {
    makeOneBotReportMsg,
    makeGSUidReportMsg,
    makeSendMsg,
    makeForwardMsg,
    makeGSUidSendMsg,
    msgToOneBotMsg
}
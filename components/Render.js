import { Version } from '../components/index.js'

function scale(pct = 1) {
  let scale = 100
  scale = Math.min(2, Math.max(0.5, scale / 100))
  pct = pct * scale
  return `style=transform:scale(${pct})`
}

const Render = {
  async render(path, params, cfg) {
    let { e } = cfg
    if (!e.runtime) {
      console.log('未找到e.runtime，请升级至最新版Yunzai')
    }

    let BotName = Version.isTrss ? 'Trss-Yunzai' : Version.isMiao ? 'Miao-Yunzai' : 'Yunzai-Bot'
    return e.runtime.render('ws-plugin', path, params, {
      retType: cfg.retMsgId ? 'msgId' : 'default',
      beforeRender({ data }) {
        let pluginName = ''
        if (data.pluginName !== false) {
          pluginName = ` & ${data.pluginName || 'ws-plugin'}`
          if (data.pluginVersion !== false) {
            pluginName += `<span class="version">${data.pluginVersion || Version.version}`
          }
        }
        let resPath = data.pluResPath
        const layoutPath = process.cwd() + '/plugins/ws-plugin/resources/common/layout/'
        return {
          ...data,
          _res_path: resPath,
          _ws_path: resPath,
          _layout_path: layoutPath,
          _tpl_path: process.cwd() + '/plugins/ws-plugin/resources/common/tpl/',
          defaultLayout: layoutPath + 'default.html',
          elemLayout: layoutPath + 'elem.html',
          sys: {
            scale: scale(cfg.scale || 1)
          },
          copyright: `Created By ${BotName}<span class="version">${Version.yunzai}</span>${pluginName}</span>`,
          pageGotoParams: {
            waitUntil: 'networkidle2'
          }
        }
      }
    })
  }
}

export default Render
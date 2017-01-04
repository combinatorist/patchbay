const fs = require('fs')
const h = require('../h')

exports.gives = {
  message_backlinks: true,
  mcss: true
}

exports.create = function (api) {
  return {
    message_backlinks,
    mcss: () => fs.readFileSync(__filename.replace(/js$/, 'mcss'), 'utf8')
  }

  function message_backlinks (msg) {
    var links = []
    for(var k in CACHE) {
      var _msg = CACHE[k]
      if(Array.isArray(_msg.content.mentions)) {
        for(var i = 0; i < _msg.content.mentions.length; i++)
          if(_msg.content.mentions[i].link == msg.key)
          links.push(k)
      }
    }

    if (links.length === 0) return null

    return h('MessageBacklinks', [
      h('header', 'backlinks:'),
      h('ul', links.map(function (link) {
        return h('li', [
          h('a -backlink', {
            href: `#${link}`
          }, link)
        ])
      }))
    ])
  }
}
const nest = require('depnest')
const { h } = require('mutant')
const pull = require('pull-stream')
const pullMerge = require('pull-merge')
const pullAbort = require('pull-abortable')
const Scroller = require('pull-scroll')
const next = require('pull-next-query')
const BookNotifications = require('scuttle-book/pull/notifications')

exports.gives = nest({
  'app.html.menuItem': true,
  'app.page.notifications': true
})

exports.needs = nest({
  'app.html.filter': 'first',
  'app.html.scroller': 'first',
  'app.sync.goTo': 'first',
  'feed.pull.public': 'first',
  'keys.sync.id': 'first',
  'message.html.render': 'first',
  'message.sync.isBlocked': 'first',
  'sbot.pull.stream': 'first'
})

exports.create = function (api) {
  return nest({
    'app.html.menuItem': menuItem,
    'app.page.notifications': notificationsPage
  })

  function menuItem () {
    return h('a', {
      'ev-click': () => api.app.sync.goTo({ page: 'notifications' })
    }, '/notifications')
  }

  function notificationsPage (location) {
    const { filterMenu, filterDownThrough, filterUpThrough, resetFeed } = api.app.html.filter(draw)
    const { container, content } = api.app.html.scroller({ prepend: [ filterMenu ] })

    var abortableDown = pullAbort()
    var abortableUp = pullAbort()

    function draw () {
      resetFeed({ container, content })

      abortableDown.abort()
      abortableDown = pullAbort()
      pull(
        pullMentions({ old: false, live: true }),
        abortableDown,
        filterDownThrough(),
        Scroller(container, content, render, true, false)
      )

      abortableUp.abort()
      abortableUp = pullAbort()
      pull(
        pullMentions({ reverse: true, live: false }),
        abortableUp,
        filterUpThrough(),
        Scroller(container, content, render, false, false)
      )
    }
    draw()

    container.title = '/notifications'
    return container
  }

  function render (msg) {
    return api.message.html.render(msg, { showTitle: true })
  }

  // NOTE - currently this stream is know to pick up:
  //   - post mentions (public)
  //     - patchwork replies (public)
  //   - scry (public, private)
  //   - reviews on scuttle-books you posted (public)

  function pullMentions (opts) {
    const query = [{
      $filter: {
        dest: api.keys.sync.id(),
        timestamp: { $gt: 0 }
      }
    }, {
      $filter: {
        value: {
          author: { $ne: api.keys.sync.id() } // not my messages!
          // NOTE putting this in second filter might be necessary to stop index trying to use this author value
        }
      }
    }]

    const _opts = Object.assign({
      query,
      limit: 100,
      index: 'DTA'
    }, opts)

    return api.sbot.pull.stream(server => {
      const bookNotifications = BookNotifications(server)
      return pullMerge(
        pull(
          next(server.backlinks.read, _opts, ['timestamp']),
          pull.filter(m => {
            if (m.value.content.type !== 'post') return true
            return !m.value.private // no private posts
          }),
          pull.filter(m => !api.message.sync.isBlocked(m))
        ),
        pull(bookNotifications(api.keys.sync.id(), opts)),
        (lhs, rhs) => {
          return rhs.value.timestamp - lhs.value.timestamp
        }
      )
    })
  }
}

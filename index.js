// Utilities
const $ = Object.assign((sel, node = document) => [...node.querySelectorAll(sel).values()], {
  Machine: function (state) {
    let es = {}, v = Object.values, r = Promise.resolve.bind(Promise); Object.seal(state);
    return Object.assign(this, {
      getState () { return state },
      on (e, fn) { (es[e] = es[e] || {})[fn.name] = fn; return this },
      stop (e, fname = '') { e in es && delete es[e][fname]; return this },
      emit (e, ...args) { return e in es && v(es[e]).reduce((s, fn) => (fn.apply(s, args), s), state) },
      emitAsync (e, ...args) { return e in es && v(es[e]).reduce((p, fn) => p.then(s => r(fn.apply(s, args)).then(() => s)), r(state)) } }) },
  pipe: (ps => (p, fn) => ps[p] = (ps[p] || Promise.resolve()).then(fn))({}),
  targets (obj, target = window) {
    let p, use = (m, fn) => { for (let es = p.split(' '), i = 0; i < es.length; i++) target[m](es[i], fn) };
    for (p in obj) if (Function.prototype.isPrototypeOf(obj[p])) {
      if (EventTarget.prototype.isPrototypeOf(target)) use('addEventListener', obj[p].bind(target));
      else if ($.Machine.prototype.isPrototypeOf(target)) use('on', obj[p])
    } else if (p in target) $.targets(obj[p], target[p]);
    else for (let k in target) if (k.match(new RegExp(`^${p}$`))) $.targets(obj[p], target[k]) },
  queries (obj, node) {
    for (let q in obj) for (let e in obj[q]) for (let ns = $(q, node) || [], es = e.split(' '), i = 0; i < es.length; i++)
      ns.forEach(n => n.addEventListener(es[i], obj[q][e].bind(n))) },
  load (id, dest = 'body') {
    let stamp = document.importNode($('template#' + id)[0].content, true);
    return $(dest).map(n => [...stamp.cloneNode(true).childNodes.values()].map(c => n.appendChild(c))) } });

// Page state
var app = new $.Machine({
  tableau: null,
  hand: null,
  discard: null,
  highscore: null,
  score: null,

  tableauCoords: [],
  discardCoords: null,
  inHand: {},
  active: null,
  vh: document.body.clientHeight / 100,

  maxHeight: 8,
  highCard: 2048,
  wildRate: 1/256,

  version: null,
  swReady: false,
  checkUpdate: false,
  a2hsPrompt: null
});

// UI Events
$.queries({
  '#game-over button': { click () {
    $('#game-over')[0].classList.remove('active');
    $('div.card').forEach(x => x.remove());
    app.emit('start')
  } }
});

$.targets({

  // Window events
  load () {
    app.emit('init');
    app.emit('start')
  },

  'mousemove touchmove' (e) {
    let {card} = app.getState().inHand, {clientX, clientY} = e.type === 'touchmove' ? e.touches[0] : e;
    if (card && !card.nextElementSibling && card.classList.contains('in-hand')) app.emit('move-card', clientX, clientY)
  },

  'mouseup touchend' (e) {
    let {card} = app.getState().inHand;
    if (card && !card.nextElementSibling && card.classList.contains('in-hand')) app.emit('drop-card')
  },

  resize () { app.emit('resize') },

  beforeinstallprompt (e) {
    e.preventDefault();
    if (sessionStorage.suppressA2hs) return false;
    app.emit('deferA2hs', e);
    app.emit('notification', {
      type: 'install',
      text: 'Add to home screen / desktop?',
      okText: 'OK',
      cancelText: 'Cancel',
      okHandler (e) {
        sessionStorage.suppressA2hs = true;
        app.emit('a2hs')
      },
      cancelHandler () { sessionStorage.suppressA2hs = true }
    })
  },

  // ServiceWorker events
  navigator: { serviceWorker: { controllerchange (e) { app.emit('update') } } },

  // Page state events
  app: {
    init () { //TODO: Tutorial
      $('.highscore')[0].textContent = this.highscore = parseInt(localStorage.highscore) || 0;
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
        .then(reg => this.swReady = !reg.installing)
        .then(() => app.emitAsync('debug')).then(() => {
          // Check for updates every hour on the hour, every minute in development mode
          let check = () => ((this.checkUpdate = true), check);
          /-dev$/.test(this.version) ?
            setTimeout(() => setInterval(check(), 6e4), 6e4 - Date.now() + new Date().setSeconds(0, 0)) :
            setTimeout(() => setInterval(check(), 3.6e6), 3.6e6 - Date.now() + new Date().setMinutes(0, 0, 0))
        })
    },

    start () {
      Object.assign(this, {
        tableau: [[], [], [], []],
        hand: [],
        discard: ($('.discard text')[0].textContent = 2),
        score: ($('.score')[0].textContent = 0)
      });
      app.emit('resize');
      app.emit('reveal');
      app.emit('reveal');
      if (this.checkUpdate) navigator.serviceWorker.ready.then(reg => reg.update())
        .then(() => this.checkUpdate = false)
    },

    resize () {
      Object.assign(this, {
        vh: document.body.clientHeight / 100,
        tableauCoords: $('.column > :last-of-type').map(el => {
          let {x, y} = el.getBoundingClientRect();
          if (el.nodeName === 'DIV') y += 5 * this.vh;
          return {x, y}
        }).filter(p => p.x !== 0 && p.y !== 0),
        discardCoords: (() => {
          let {x, y} = $('.discard > svg')[0].getBoundingClientRect();
          return {x, y}
        })()
      })
    },

    reveal () {
      let card = $.load('card', '.hand')[0][0],
          value = 2 ** (1 + Math.floor(6 * Math.random())), state = this;
      if (Math.random() > this.wildRate) card.classList.add('face' + value);
      else {
        value = -1;
        card.classList.add('wildcard')
      }
      this.hand.push(value);
      $.queries({'.hand > :last-child': {
        'mousedown touchstart' (e) {
          if (this.nextElementSibling) return false;
          let {clientX, clientY} = e.type === 'touchstart' ? e.touches[0] : e,
              {x, y} = this.getBoundingClientRect();
          this.classList.remove('activating');
          this.classList.add('in-hand');
          state.inHand = {layerX: clientX - x, layerY: clientY - y};
          state.inHand.card = this;
          this.style.left = x + 'px';
          this.style.top = y + 'px'
        }
      }});
      if ($('.hand > *').length === 1) setTimeout(() => app.emitAsync('pipeCard', card), 25); //BUG: How to wait for redraw in firefox?
      else $('.hand')[0].insertBefore(card, $('.hand > :first-child')[0])
    },

    'move-card' (x, y) {
      let style = this.inHand.card.style, card = this.inHand;
      style.left = x - card.layerX + 'px';
      style.top = y - card.layerY + 'px';
      $('.discard, .column').forEach((el, i) => {
        if (this.active !== null && this.active !== i) return false;
        let obj = i === 4 ? this.discardCoords : this.tableauCoords[i],
            d = Math.hypot(obj.x - x + card.layerX, obj.y - y + card.layerY);
        if (this.active === null && d < this.vh * 6) {
          this.active = i;
          el.classList.add('active');
        } else if (this.active !== null && d >= this.vh * 6) {
          this.active = null;
          el.classList.remove('active')
        }
      })
    },

    'drop-card' () {
      let {card} = this.inHand;
      card.classList.remove('in-hand');
      card.style = null;
      this.inHand = {};
      if (this.active === null) return false;
      else {
        let el = $('.active')[0];
        if (el.classList.contains('column')) {
          let i = $('.column').indexOf(el), {length} = this.tableau[i],
              value = card.classList.contains('wildcard') ? -1 : parseInt(card.classList.value.match(/\d+$/)[0]);
          el.classList.remove('active');
          if (length < this.maxHeight) {
            this.tableau[i].push(value);
            el.insertBefore(card, $('svg', el)[0]);
            let {x, y} = card.getBoundingClientRect();
            y += 5 * this.vh;
            this.tableauCoords[i] = {x, y};
            this.hand.shift();
            app.emit('reduce', i)
          } else if (length === this.maxHeight && (this.tableau[i][this.maxHeight - 1] === value || value === -1)) {
            this.tableau[i].push(value);
            card.remove();
            this.hand.shift();
            app.emit('reduce', i)
          } else return false
        } else if (el.classList.contains('discard')) {
          $('.discard')[0].classList.remove('active');
          if (this.discard === 0) return false;
          $('text', el)[0].textContent = --this.discard;
          card.remove();
          this.hand.shift();
          app.emit('check-game-over')
        }
        let nextcard = $('.hand > div.card:first-child')[0];
        if (nextcard) app.emitAsync('pipeCard', nextcard).then(() => app.emit('reveal'));
        else setTimeout(() => app.emit('reveal'), 600);
      }
    },

    pipeCard (card) {
      return $.pipe('handAnimation', () => new Promise(r => {
        card.classList.add('activating');
        setTimeout(() => r(card.classList.remove('activating')), 600)
      }))
    },

    reduce (i) {
      let column = $('.column')[i], colvals = this.tableau[i], {length} = colvals,
          curval = colvals[length - 1], prevval = colvals[length - 2];
      if (prevval && prevval === -1 ^ (curval === -1 || colvals[length - 2] === curval)) {
        colvals[length - 2] = (curval = Math.max(colvals.pop(), prevval)) * 2;
        let card = $('div.card:last-of-type', column)[0];
        if (length > this.maxHeight) {
          card.classList.remove('face' + curval);
          card.classList.remove('wildcard');
          card.classList.add('face' + curval * 2);
          $('.score')[0].textContent = (this.score += curval * 2);
          app.emit('reduce', i)
        } else {
          card.classList.add('reducing');
          this.tableauCoords[i] = {x: -1000, y: -1000};
          setTimeout(() => {
            let nextcard = $('div.card:nth-last-of-type(2)', column)[0], {x, y} = nextcard.getBoundingClientRect();
            y += 5 * this.vh;
            this.tableauCoords[i] = {x, y};
            nextcard.classList.remove('face' + curval);
            nextcard.classList.remove('wildcard');
            nextcard.classList.add('face' + curval * 2);
            card.remove();
            $('.score')[0].textContent = (this.score += curval * 2);
            if (curval === this.highCard / 2) app.emit('clear-column', i);
            else app.emit('reduce', i)
          }, 600)
        }
      } else app.emit('check-game-over')
    },

    'clear-column' (i) {
      let {length} = this.tableau[i];
      this.tableau[i] = [];
      $(`.column:nth-child(${i+1}) > div.card:nth-last-of-type(n+2)`).forEach(el => el.remove());
      let final = $(`.column:nth-child(${i+1}) > div.card`)[0];
      final.style.marginTop = 5 * (length - 1) + 'vh';
      final.classList.add('complete');
      setTimeout(() => {
        final.remove();
        let {x, y} = $('.column > svg')[i].getBoundingClientRect();
        this.tableauCoords[i] = {x, y};
        $('.discard text')[0].textContent = this.discard += 2
      }, 600)
    },

    'check-game-over' () {
      if (this.tableau.every(x => x.length === this.maxHeight &&
        x[this.maxHeight - 1] !== this.hand[0]) && this.discard === 0) {
        let modal = $('#game-over')[0];
        modal.classList.add('active');
        if (this.highscore < this.score) $('.highscore')[0].textContent =
          localStorage.highscore = this.highscore = this.score
      }
    },

    notification (obj) {
      let note = $.load('notification', '#notifications')[0][0];
      $('div', note)[0].textContent = obj.text;
      note.id = obj.type;
      $('button', note).forEach(el => {
        let which = el.id;
        el.textContent = obj[which + 'Text'];
        el.id = obj.type + '-' + which;
        $.queries({ ['button#' + el.id]: { click (e) {
          note.remove();
          obj[which + 'Handler'].bind(this)(e)
        } } }, note)
      })
    },

    deferA2hs (e) { this.a2hsPrompt = e },
    a2hs () {
      this.a2hsPrompt.prompt();
      this.a2hsPrompt.userChoice.then(() => this.a2hsPrompt = null)
    },

    update () {
      if (this.swReady) app.emit('notification', {
        type: 'update',
        text: 'New update available!',
        okText: 'Refresh',
        cancelText: 'Dismiss',
        okHandler (e) { location.reload() },
        cancelHandler () {}
      });
      this.swReady = true
    },

    debug () { // BUG: Cannot recover from Ctrl-F5
      let recover;
      return $.pipe('debug', () => new Promise((resolve, reject) => this.version === null ? reject() : resolve())
        .catch(recover = () => fetch('version')
          .then(res => res.status === 404 ? recover() : res.text().then(ver => this.version = ver)))
        .then(() => /-dev$/.test(this.version) && app.emit('debug-actions')))
    },
    'debug-actions' () { $('.debug')[0].textContent = this.version }
  }

})

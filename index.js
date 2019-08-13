// Utilities
var $ = (wm => { let v = Object.values, r = Promise.resolve.bind(Promise),
    test = (obj, con) => obj.constructor === con || con.prototype.isPrototypeOf(obj),
    add = (k, t, fn, es = wm.get(k) || {}) => { remove(k, t, fn.name); k.addEventListener(t, (es[t] = es[t] || {})[fn.name] = fn); wm.set(k, es) },
    remove = (k, t, fname, es = wm.get(k)) => { if (es && t in es && fname in es[t]) {
      k.removeEventListener(t, es[t][fname]); delete es[t][fname] && (v(es[t]).length || delete es[t]) && (v(es).length || wm.delete(k)) } };
  return Object.assign((sel, node = document) => v(node.querySelectorAll(sel)), {
    Machine: function (state) { let es = {}; Object.seal(state);
      return Object.assign(this, {
        state () { return state },
        on (t, fn) { (es[t] = es[t] || {})[fn.name] = fn; return this },
        stop (t, fname = '') { t in es && delete es[t][fname] && (v(es[t]).length || delete es[t]); return this },
        emit (t, ...args) { return t in es && v(es[t]).reduce((s, fn) => (fn.apply(s, args), s), state) },
        emitAsync (t, ...args) { return t in es && v(es[t]).reduce((p, fn) => p.then(s => r(fn.apply(s, args)).then(() => s)), r(state)) } }) },
    pipe: (ps => (p, ...ands) => ps[p] = (ps[p] || r()).then(() => Promise.all(ands.map(ors =>
      test(ors, Array) && Promise.race(ors.map(fn => fn())) || test(ors, Function) && ors()))))({}),
    targets (obj, target = window) {
      for (let ts in obj) if (test(obj[ts], Function)) { if (test(target, $.Machine)) ts.split(' ').forEach(t => target.on(t, obj[ts]));
        else if (test(target, EventTarget)) ts.split(' ').forEach(t => add(target, t, obj[ts].bind(target))) }
      else if (test(obj[ts], String)) { if (test(target, $.Machine)) ts.split(' ').forEach(t => target.stop(t, obj[ts]));
        else if (test(target, EventTarget)) ts.split(' ').forEach(t => remove(target, t, 'bound ' + obj[ts])) }
      else if (ts in target) $.targets(obj[ts], target[ts]);
      else for (let k in target) if (k.match(new RegExp(`^${ts}$`))) $.targets(obj[ts], target[k]) },
    queries (obj, root) {
      for (let q in obj) { let ns = $(q, root); if (ns.length) for (let ts in obj[q])
        if (test(obj[q][ts], Function)) ts.split(' ').forEach(t => ns.forEach(n => add(n, t, obj[q][ts].bind(n))));
        else if (test(obj[q][ts], String)) ts.split(' ').forEach(t => ns.forEach(n => remove(n, t, 'bound ' + obj[q][ts]))) } },
    load (id, dest = 'body') {
      let stamp = document.importNode($('template#' + id)[0].content, true);
      return $(dest).map(n => v(stamp.cloneNode(true).childNodes).map(c => n.appendChild(c))) } }) })(new WeakMap());


// Game functionality

var game = new $.Machine({
  // Game state
  tableau: null,
  hand: null,
  discard: null,
  highscore: null,
  score: null,

  // Display state
  tableauCoords: [],
  discardCoords: null,
  inHand: {},
  active: null,
  vh: document.body.clientHeight / 100,

  // Game constants
  maxHeight: 8,
  highCard: 2048,
  wildRate: 1/256
});

// UI Events

$.queries({
  '#game-over button': { click () {
    $('#game-over')[0].classList.remove('active');
    $('div.card').forEach(x => x.remove());
    game.emit('start')
  } }
});

$.targets({

  // Window events

  load () { game.emit('init') },
  'mousemove touchmove' (e) { game.emit('move-card', e) },
  'mouseup touchend' () { game.emit('drop-card') },
  resize () { game.emit('resize') },

  // Game events

  game: {
    init () { //TODO: Tutorial
      $('.highscore')[0].textContent = this.highscore = parseInt(localStorage.highscore) || 0;
      game.emit('start')
    },

    start () {
      this.tableau = [[], [], [], []];
      this.hand = [];
      this.discard = ($('.discard text')[0].textContent = 2);
      this.score = ($('.score')[0].textContent = 0);
      game.emit('resize');
      game.emit('reveal');
      game.emit('reveal');
      pwa.emit('check-update')
    },

    resize () {
      this.vh = parseFloat(getComputedStyle(document.documentElement).fontSize) / 2;
      this.tableauCoords = $('.column > :last-of-type').map(el => {
        let {x, y} = el.getBoundingClientRect();
        if (el.nodeName === 'DIV') y += 5 * this.vh;
        return {x, y}
      }).filter(p => p.x !== 0 && p.y !== 0);
      let {x, y} = $('.discard > svg')[0].getBoundingClientRect();
      this.discardCoords = {x, y}
    },

    reveal () {
      let card = $.load('card', '.hand')[0][0],
          value = 2 ** (1 + Math.floor(6 * Math.random())), gameState = this;
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
          gameState.inHand = {layerX: clientX - x, layerY: clientY - y, card: this};
          this.style.left = x + 'px';
          this.style.top = y + 'px'
        }
      }});
      if ($('.hand > *').length === 1) setTimeout(() => game.emitAsync('animate-card', card), 25); //BUG: How to wait for redraw in firefox?
      else $('.hand')[0].insertBefore(card, $('.hand > :first-child')[0])
    },

    'move-card' (e) {
      let {card, layerX, layerY} = this.inHand,
          {clientX, clientY} = e.type === 'touchmove' ? e.touches[0] : e;
      if (!card || card.nextElementSibling || !card.classList.contains('in-hand')) return false;
      card.style.left = clientX - layerX + 'px';
      card.style.top = clientY - layerY + 'px';
      $('.discard, .column').forEach((el, i) => {
        if (this.active !== null && this.active !== i) return false;
        let obj = i === 4 ? this.discardCoords : this.tableauCoords[i],
            d = Math.hypot(obj.x - clientX + layerX, obj.y - clientY + layerY);
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
      if (!card || card.nextElementSibling || !card.classList.contains('in-hand')) return false;
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
            game.emit('reduce', i)
          } else if (length === this.maxHeight && (this.tableau[i][this.maxHeight - 1] === value || value === -1)) {
            this.tableau[i].push(value);
            card.remove();
            this.hand.shift();
            game.emit('reduce', i)
          } else return false
        } else if (el.classList.contains('discard')) {
          $('.discard')[0].classList.remove('active');
          if (this.discard === 0) return false;
          $('text', el)[0].textContent = --this.discard;
          card.remove();
          this.hand.shift();
          game.emit('check-game-over')
        }
        let nextcard = $('.hand > div.card:first-child')[0];
        if (nextcard) game.emitAsync('animate-card', nextcard).then(() => game.emit('reveal'));
        else setTimeout(() => game.emit('reveal'), 600);
      }
    },

    'animate-card' (card) {
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
          game.emit('reduce', i)
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
            if (curval === this.highCard / 2) game.emit('clear-column', i);
            else game.emit('reduce', i)
          }, 600)
        }
      } else game.emit('check-game-over')
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
        x[this.maxHeight - 1] !== this.hand[0]) && this.discard === 0 && this.hand[0] !== -1) {
        let modal = $('#game-over')[0];
        modal.classList.add('active');
        if (this.highscore < this.score) $('.highscore')[0].textContent =
          localStorage.highscore = this.highscore = this.score
      }
    }
  }

});


// Common functionality

var app = new $.Machine({})
  .on('notification', function (obj) {
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
  })
  .on('debug', function (data) { $('.debug')[0].textContent = data.version });


// PWA functionality

var pwa = new $.Machine({
  version: null,
  swReady: false,
  allowUpdate: false,
  a2hsPrompt: null
});

$.targets({

  // Window events

  load: function pwaload () {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
      .then(reg => this.swReady = !reg.installing)
      .then(() => pwa.emitAsync('debug')).then(() => {
        // Check for updates every hour on the hour, every minute in development mode
        let check = () => ((this.allowUpdate = true), check);
        /-dev$/.test(this.version) ?
          setTimeout(() => setInterval(check(), 6e4), 6e4 - Date.now() + new Date().setSeconds(0, 0)) :
          setTimeout(() => setInterval(check(), 3.6e6), 3.6e6 - Date.now() + new Date().setMinutes(0, 0, 0))
      })
  },

  beforeinstallprompt (e) {
    e.preventDefault();
    if (sessionStorage.suppressA2hs) return false;
    pwa.emit('deferA2hs', e);
    app.emit('notification', {
      type: 'install',
      text: 'Add to home screen / desktop?',
      okText: 'OK',
      cancelText: 'Cancel',
      okHandler (e) {
        sessionStorage.suppressA2hs = true;
        pwa.emit('a2hs')
      },
      cancelHandler () { sessionStorage.suppressA2hs = true }
    })
  },

  // ServiceWorker events

  navigator: { serviceWorker: { controllerchange (e) { pwa.emit('update') } } },

  // PWA events

  pwa: {
    deferA2hs (e) { this.a2hsPrompt = e },
    a2hs () {
      this.a2hsPrompt.prompt();
      this.a2hsPrompt.userChoice.then(() => this.a2hsPrompt = null)
    },

    'check-update' () {
      if (this.allowUpdate) navigator.serviceWorker.ready.then(reg => reg.update())
        .then(() => this.allowUpdate = false)
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
        .then(() => /-dev$/.test(this.version) && app.emit('debug', {version: this.version})))
    }
  }
})

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
  targets (obj, target = window) {
    for (let t in obj) for (let k in target) if (k.match(new RegExp(`^${t}$`))) {
      if (EventTarget.prototype.isPrototypeOf(target[k])) for (let e in obj[t])
        for (let es = e.split(' '), i = 0; i < es.length; i++) target[k].addEventListener(es[i], obj[t][e].bind(target[k]));
      else if ($.Machine.prototype.isPrototypeOf(target[k])) for (let e in obj[t])
        for (let es = e.split(' '), i = 0; i < es.length; i++) target[k].on(es[i], obj[t][e]) } },
  queries (obj, node) {
    for (let q in obj) for (let e in obj[q]) for (let ns = $(q, node) || [], es = e.split(' '), i = 0; i < es.length; i++)
      ns.forEach(n => n.addEventListener(es[i], obj[q][e].bind(n))) },
  load (id, dest = 'body') { $(dest).forEach(n => n.appendChild(document.importNode($('template#' + id)[0].content, true))) } })

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
  vh: document.body.clientHeight / 100,
  handPipeline: Promise.resolve(),

  maxHeight: 8,
  highCard: 2048,
  wildRate: 1/256,

  deferredPrompt: null
});

// Events
$.queries({
  '#game-over button': { click () {
    $('#game-over')[0].classList.remove('active');
    $('div.card').forEach(x => x.remove());
    app.emit('start')
  } },
  '#a2hs #install-ok': { click (e) {
    $('#a2hs')[0].classList.remove('active');
    app.emit('a2hs')
  } },
  '#a2hs #install-cancel': { click (e) {
    $('#a2hs')[0].classList.remove('active');
    sessionStorage.suppressA2hs = true
  } },
  '#update #update-ok': { click (e) {
    $('#update')[0].classList.remove('active');
    location.reload()
  } },
  '#update #update-cancel': { click (e) {
    $('#update')[0].classList.remove('active')
  } }
});

$.targets({ serviceWorker: { controllerchange (e) { $('#update')[0].classList.add('active') } } }, navigator);

$.targets({
  window: {

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
      app.emit('setDeferredPrompt', e);
      $('#a2hs')[0].classList.add('active')
    }

  },

  app: {

    init () { //TODO: Tutorial
      $('.highscore')[0].textContent = this.highscore = parseInt(localStorage.highscore) || 0;
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
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
      app.emit('reveal')
    },

    resize () {
      Object.assign(this, {
        vh: document.body.clientHeight / 100,
        tableauCoords: $('.column > :last-of-type').map(el => {
          let {x, y} = el.getBoundingClientRect();
          if (el.nodeName === 'DIV') y += 5 * this.vh;
          return {x, y}
        }).filter(p => p.x + p.y !== 0),
        discardCoords: (() => {
          let {x, y} = $('.discard > svg')[0].getBoundingClientRect();
          return {x, y}
        })()
      })
    },

    reveal () {
      $.load('card', '.hand');
      let card = $('.hand > :last-child')[0],
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
          let layerX, layerY, clientX, clientY;
          if (e.type === 'mousedown') ({layerX, layerY, clientX, clientY} = e);
          else if (e.type === 'touchstart') {
            ({clientX, clientY} = e.touches[0]);
            let {x, y} = this.getBoundingClientRect();
            layerX = clientX - x;
            layerY = clientY - y
          }
          state.inHand = {layerX, layerY};
          state.inHand.card = this;
          this.classList.add('in-hand');
          this.classList.remove('activating');
          this.style.left = clientX - layerX + 'px';
          this.style.top = clientY - layerY + 'px'
        }
      }});
      if ($('.hand > *').length === 1) setTimeout(() => app.emitAsync('pipeCard', card), 25); //BUG: How to wait for redraw?
      else $('.hand')[0].insertBefore(card, $('.hand > :first-child')[0])
    },

    'move-card' (x, y) { // TODO: IntersectionObserver
      let style = this.inHand.card.style;
      style.left = x - this.inHand.layerX + 'px';
      style.top = y - this.inHand.layerY + 'px'
      this.tableauCoords.forEach((obj, i) => {
        let d = Math.hypot(obj.x - x + this.inHand.layerX, obj.y - y + this.inHand.layerY);
        if (d < this.vh * 6) $('.column')[i].classList.add('active');
        else $('.column')[i].classList.remove('active')
      });
      let dc = this.discardCoords, d = Math.hypot(dc.x - x + this.inHand.layerX, dc.y - y + this.inHand.layerY);
      if (d < this.vh * 6) $('.discard')[0].classList.add('active');
      else $('.discard')[0].classList.remove('active')
    },

    'drop-card' () {
      let {card} = this.inHand, active = $('.active');
      card.classList.remove('in-hand');
      card.style = null;
      this.inHand = {};
      if (active.length) {
        let el = active[0];
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
      } else return false
    },

    pipeCard (card) {
      return this.handPipeline.then(() => new Promise(r => {
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

    setDeferredPrompt (e) { this.deferredPrompt = e },
    a2hs () {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') console.log('User accepted the A2HS prompt');
        else console.log('User dismissed the A2HS prompt');
        this.deferredPrompt = null
      })
    }

  }
})

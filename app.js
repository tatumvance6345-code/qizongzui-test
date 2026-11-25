(function () {
  'use strict';

  var STORE_KEY = 'qizongzui_progress_v1';
  var TOTAL = QUESTIONS.length;
  var MARKS = ['甲', '乙', '丙', '丁'];

  var $ = function (id) { return document.getElementById(id); };

  /* ───── 预处理：解析分值，计算每个维度的满分（用于归一化） ───── */
  QUESTIONS.forEach(function (q) {
    q.o = q.o.map(function (pair) {
      var scores = {};
      pair[1].split(' ').forEach(function (tok) { scores[tok.charAt(0)] = Number(tok.slice(1)); });
      return { text: pair[0], scores: scores };
    });
  });
  var MAX = {};
  DIMS.forEach(function (d) {
    MAX[d] = QUESTIONS.reduce(function (sum, q) {
      return sum + Math.max.apply(null, q.o.map(function (o) { return o.scores[d] || 0; }));
    }, 0);
  });

  /* ───── 状态 ───── */
  var answers = new Array(TOTAL).fill(null);
  var current = 0;
  var locked = false;

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ answers: answers, current: current })); } catch (e) {}
  }
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (data && Array.isArray(data.answers) && data.answers.length === TOTAL) return data;
    } catch (e) {}
    return null;
  }
  function clearSave() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* ───── 屏幕切换 ───── */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    window.scrollTo(0, 0);
  }

  /* ───── 首页 ───── */
  function renderHome() {
    var row = $('sealRow');
    row.innerHTML = '';
    DIMS.forEach(function (d, i) {
      var r = RESULTS[d];
      var el = document.createElement('span');
      el.className = 'mini-avatar';
      el.title = r.sin + ' · ' + r.type + ' · ' + r.figure;
      el.style.setProperty('--c', r.color);
      el.style.animationDelay = (0.15 + i * 0.08) + 's';
      el.innerHTML = '<img alt=""><i></i>';
      el.querySelector('img').src = r.img;
      el.querySelector('i').textContent = r.seal;
      row.appendChild(el);
    });
    var saved = load();
    var answered = saved ? saved.answers.filter(function (a) { return a !== null; }).length : 0;
    $('resumeBtn').classList.toggle('hidden', !(answered > 0 && answered < TOTAL));
    if (answered > 0 && answered < TOTAL) $('resumeBtn').textContent = '继续上次的答题（已答 ' + answered + ' 题）';
  }

  function start(resume) {
    var saved = resume ? load() : null;
    if (saved) {
      answers = saved.answers;
      current = Math.min(saved.current, TOTAL - 1);
    } else {
      answers = new Array(TOTAL).fill(null);
      current = 0;
      clearSave();
    }
    show('quiz');
    renderQuestion('next');
  }

  /* ───── 答题 ───── */
  function renderQuestion(dir) {
    var q = QUESTIONS[current];
    $('qIndex').textContent = current + 1;
    $('qTotal').textContent = TOTAL;
    $('qCat').textContent = q.cat;
    $('qText').textContent = q.q;
    $('backBtn').disabled = current === 0;

    var done = answers.filter(function (a) { return a !== null; }).length;
    $('progressBar').style.width = (done / TOTAL * 100) + '%';
    document.querySelector('.progress').setAttribute('aria-valuenow', done);

    var list = $('options');
    list.innerHTML = '';
    q.o.forEach(function (opt, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.className = 'option' + (answers[current] === i ? ' selected' : '');
      btn.type = 'button';
      btn.innerHTML = '<span class="mark">' + MARKS[i] + '</span><span class="otext"></span>';
      btn.querySelector('.otext').textContent = opt.text;
      btn.addEventListener('click', function () { choose(i); });
      li.appendChild(btn);
      list.appendChild(li);
    });

    var card = $('qCard');
    card.classList.remove('enter-next', 'enter-prev');
    void card.offsetWidth;
    card.classList.add(dir === 'prev' ? 'enter-prev' : 'enter-next');
    locked = false;
  }

  function choose(i) {
    if (locked) return;
    locked = true;
    answers[current] = i;
    save();
    var btns = $('options').querySelectorAll('.option');
    btns.forEach(function (b, k) { b.classList.toggle('selected', k === i); });
    var done = answers.filter(function (a) { return a !== null; }).length;
    $('progressBar').style.width = (done / TOTAL * 100) + '%';

    setTimeout(function () {
      var next = answers.indexOf(null, current + 1);
      if (next === -1) next = answers.indexOf(null);
      if (next === -1) { finish(); return; }
      current = next;
      save();
      renderQuestion('next');
    }, 280);
  }

  function back() {
    if (current === 0 || locked) return;
    current -= 1;
    save();
    renderQuestion('prev');
  }

  /* ───── 计分 ───── */
  function compute() {
    var raw = {};
    DIMS.forEach(function (d) { raw[d] = 0; });
    answers.forEach(function (a, qi) {
      var s = QUESTIONS[qi].o[a].scores;
      Object.keys(s).forEach(function (d) { raw[d] += s[d]; });
    });
    var pct = {};
    DIMS.forEach(function (d) { pct[d] = Math.round(raw[d] / MAX[d] * 100); });
    var order = DIMS.slice().sort(function (a, b) {
      return (raw[b] / MAX[b]) - (raw[a] / MAX[a]) || raw[b] - raw[a];
    });
    return { raw: raw, pct: pct, order: order };
  }

  // 挑出用户亲手选过、最能体现主人格的选项，作为匹配理由的“证据”
  function evidence(top) {
    var hits = [];
    answers.forEach(function (a, qi) {
      var opt = QUESTIONS[qi].o[a];
      if ((opt.scores[top] || 0) >= 2) hits.push({ q: QUESTIONS[qi].q, a: opt.text });
    });
    if (hits.length <= 3) return hits;
    var step = hits.length / 3;
    return [hits[0], hits[Math.floor(step)], hits[Math.floor(step * 2)]];
  }

  function finish() {
    clearSave();
    var res = compute();
    $('loadingSeal').textContent = RESULTS[res.order[0]].seal;
    [res.order[0], res.order[1], RESULTS[res.order[0]].partner, RESULTS[res.order[0]].rival].forEach(function (d) {
      new Image().src = RESULTS[d].img;   // 推演动画期间预加载插画
    });
    show('loading');
    setTimeout(function () { renderResult(res); show('result'); animateBars(); }, 1700);
  }

  /* ───── 结果页 ───── */
  function renderResult(res) {
    var topKey = res.order[0], subKey = res.order[1];
    var r = RESULTS[topKey], sub = RESULTS[subKey];
    var page = $('result');
    page.style.setProperty('--accent', r.color);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f3ede2');

    $('rSeal').textContent = r.seal;
    $('rPortrait').src = r.img;
    $('rPortrait').alt = r.figure + '插画';
    $('rSin').textContent = r.sin + ' · ' + r.type;
    $('rSinEn').textContent = r.sinEn;
    $('rCombo').textContent = sub.modifier + r.type;
    $('rFigure').textContent = r.figure;
    $('rFigureSub').textContent = r.figureSub;
    $('rSlogan').textContent = r.slogan;

    $('rTags').innerHTML = '';
    r.tags.forEach(function (t) {
      var s = document.createElement('span');
      s.className = 'tag'; s.textContent = '#' + t;
      $('rTags').appendChild(s);
    });

    var bars = $('rBars');
    bars.innerHTML = '<p class="bars-title">七 宗 罪 浓 度</p>';
    res.order.forEach(function (d, i) {
      var row = document.createElement('div');
      row.className = 'bar-row' + (i === 0 ? ' top' : '');
      row.innerHTML =
        '<span class="bar-label">' + RESULTS[d].sin + '<i>' + RESULTS[d].type + '</i></span>' +
        '<span class="bar-track"><span class="bar-fill" data-w="' + res.pct[d] + '"></span></span>' +
        '<span class="bar-val">' + res.pct[d] + '%</span>';
      bars.appendChild(row);
    });

    $('rTrait').textContent = r.trait;
    $('rReason').textContent =
      '你的「' + r.sin + '」浓度达到 ' + res.pct[topKey] + '%，在七宗罪中排名第一；副人格是「' +
      sub.sin + '」（' + res.pct[subKey] + '%），所以你是一位' + sub.modifier + r.type + '。' + r.reason +
      '下面这几个选择，几乎就是' + r.figure + '本人会做的：';

    var quotes = $('rQuotes');
    quotes.innerHTML = '';
    evidence(topKey).forEach(function (h) {
      var li = document.createElement('li');
      li.innerHTML = '<small></small><b>你选了</b><span></span>';
      li.querySelector('small').textContent = h.q;
      li.querySelector('span').textContent = '「' + h.a + '」';
      quotes.appendChild(li);
    });

    $('rStrength').textContent = r.strength;
    $('rEgg').textContent = r.egg;

    var rel = $('rRelations');
    rel.innerHTML = '';
    // 副人格恰好是搭档/对手时，合并到副人格格子里，空出的格子换成“第三人格”，避免出现两个同样的人物
    var cells = [['副人格', subKey]];
    var used = [subKey];
    [['最佳搭档', r.partner, '副人格·搭档'], ['相爱相杀', r.rival, '副人格·冤家']].forEach(function (c) {
      if (c[1] === subKey) {
        cells[0][0] = c[2];
        var third = res.order.slice(1).filter(function (d) { return used.indexOf(d) === -1 && d !== r.partner && d !== r.rival; })[0];
        cells.push(['第三人格', third]); used.push(third);
      } else {
        cells.push([c[0], c[1]]); used.push(c[1]);
      }
    });
    cells.forEach(function (pair) {
      var x = RESULTS[pair[1]];
      var div = document.createElement('div');
      div.className = 'rel';
      div.innerHTML = '<p class="rel-k"></p><div class="rel-avatar"><img alt=""><i></i></div><p class="rel-name"></p><p class="rel-sub"></p>';
      div.querySelector('.rel-k').textContent = pair[0];
      div.querySelector('.rel-avatar').style.setProperty('--c', x.color);
      div.querySelector('.rel-avatar img').src = x.img;
      div.querySelector('.rel-avatar i').textContent = x.seal;
      div.querySelector('.rel-name').textContent = x.figure;
      div.querySelector('.rel-sub').textContent = x.sin + ' · ' + x.type;
      rel.appendChild(div);
    });

    page.dataset.share = '我测出了七宗罪人格「' + r.sin + ' · ' + r.type + '」，古人原型是' + r.figure +
      '！' + r.slogan + ' 你骨子里又是哪位古人？来测测你的七宗罪人格～';
  }

  function animateBars() {
    var fills = document.querySelectorAll('#rBars .bar-fill');
    fills.forEach(function (f) { f.style.width = '0'; });
    requestAnimationFrame(function () {
      setTimeout(function () {
        fills.forEach(function (f) { f.style.width = f.dataset.w + '%'; });
      }, 350);
    });
  }

  /* ───── 分享 / 重测 ───── */
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function copyShare() {
    var text = $('result').dataset.share || '';
    var ok = function () { toast('分享文案已复制，截图结果卡一起发吧'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, function () { fallbackCopy(text) ? ok() : toast('复制失败，请手动截图分享'); });
    } else {
      fallbackCopy(text) ? ok() : toast('复制失败，请手动截图分享');
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  function restart() {
    clearSave();
    answers = new Array(TOTAL).fill(null);
    current = 0;
    renderHome();
    show('home');
  }

  /* ───── 绑定 ───── */
  $('startBtn').addEventListener('click', function () { start(false); });
  $('resumeBtn').addEventListener('click', function () { start(true); });
  $('backBtn').addEventListener('click', back);
  $('copyBtn').addEventListener('click', copyShare);
  $('restartBtn').addEventListener('click', restart);

  document.addEventListener('keydown', function (e) {
    if (!$('quiz').classList.contains('active')) return;
    var k = e.key;
    if (k >= '1' && k <= '4') choose(Number(k) - 1);
    else if ('abcdABCD'.indexOf(k) > -1 && k.length === 1) choose('abcd'.indexOf(k.toLowerCase()));
    else if (k === 'ArrowLeft' || k === 'Backspace') back();
  });

  renderHome();
})();

(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;

  // menu mobile
  var burger = document.querySelector(".burger");
  var links = document.getElementById("links");
  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.setAttribute("aria-expanded", open);
    });
  }

  // nom qui apparaît lettre par lettre
  var h = document.querySelector("[data-letters]");
  if (h && !reduce) {
    var i = 0;
    [].slice.call(h.childNodes).forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.textContent.split(/( )/).forEach(function (word) {
        if (!word) return;
        if (word === " ") { frag.appendChild(document.createTextNode(" ")); return; }
        var wd = document.createElement("span");
        wd.style.whiteSpace = "nowrap";
        wd.setAttribute("aria-hidden", "true");
        word.split("").forEach(function (ch) {
          var s = document.createElement("span");
          s.className = "l";
          s.textContent = ch;
          s.style.animationDelay = i++ * 55 + "ms";
          wd.appendChild(s);
        });
        frag.appendChild(wd);
      });
      if (node.nodeType === 1) { node.textContent = ""; node.appendChild(frag); }
      else h.replaceChild(frag, node);
    });
  }

  // mots qui s'écrivent tout seuls
  var w = document.getElementById("word");
  if (w && !reduce) {
    var words = JSON.parse(w.getAttribute("data-words") || "[]");
    var wi = 0;
    var type = function (t, cb) {
      var k = 0;
      (function step() { w.textContent = t.slice(0, ++k); if (k < t.length) setTimeout(step, 45); else cb(); })();
    };
    var erase = function (cb) {
      (function step() { var t = w.textContent; if (t.length) { w.textContent = t.slice(0, -1); setTimeout(step, 22); } else cb(); })();
    };
    if (words.length > 1) {
      setTimeout(function loop() {
        erase(function () { wi = (wi + 1) % words.length; type(words[wi], function () { setTimeout(loop, 2200); }); });
      }, 2600);
    }
  }

  // bandeau défilant sans coupure
  var tr = document.querySelector(".track");
  if (tr) tr.innerHTML += tr.innerHTML;

  // apparitions au défilement (seulement sous la ligne de flottaison)
  var rv = [].slice.call(document.querySelectorAll(".rv"));
  if (hasIO && !reduce) {
    var vh = window.innerHeight;
    rv.forEach(function (el) { if (el.getBoundingClientRect().top > vh) el.classList.add("pre"); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.remove("pre"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    rv.forEach(function (el) { io.observe(el); });
  }

  // chiffres qui comptent
  var count = function (el) {
    var end = +el.dataset.count, t0 = null;
    var f = function (t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / 1400, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  };
  if (hasIO && !reduce) {
    var co = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { count(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    document.querySelectorAll("[data-count]").forEach(function (n) { co.observe(n); });
  }

  // barre de progression + ligne du parcours
  var bar = document.querySelector(".progress");
  var tl = document.querySelector(".tl");
  var fill = document.querySelector(".tl .fill");
  var onScroll = function () {
    var d = document.documentElement, max = d.scrollHeight - d.clientHeight;
    if (bar) bar.style.transform = "scaleX(" + (max > 0 ? window.scrollY / max : 0) + ")";
    if (tl && fill) {
      var r = tl.getBoundingClientRect(), p = (window.innerHeight * 0.6 - r.top) / r.height;
      fill.style.height = Math.max(0, Math.min(1, p)) * (r.height - 12) + "px";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // cartes qui s'inclinent sous la souris
  if (!reduce && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".tilt").forEach(function (c) {
      c.addEventListener("mousemove", function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = "perspective(900px) rotateY(" + x * 10 + "deg) rotateX(" + -y * 10 + "deg) translateY(-4px)";
      });
      c.addEventListener("mouseleave", function () { c.style.transform = ""; });
    });
  }

  // copier l'adresse e-mail
  var cp = document.getElementById("copy");
  if (cp) {
    cp.addEventListener("click", function () {
      var t = cp.getAttribute("data-email");
      navigator.clipboard.writeText(t).then(function () { cp.textContent = "Copié ✓"; }, function () { cp.textContent = t; });
    });
  }

  // pré-remplir l'objet quand on arrive depuis un cours
  var params = new URLSearchParams(location.search);
  var cours = params.get("cours");
  var obj = document.getElementById("f-obj");
  var msg = document.getElementById("f-msg");
  if (cours && obj && msg) {
    obj.value = "Réserver un cours";
    if (!msg.value) msg.value = "Bonjour Anissa, je souhaite réserver le cours « " + cours + " ».";
  }
})();

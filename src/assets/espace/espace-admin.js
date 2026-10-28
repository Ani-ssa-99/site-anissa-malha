// Tableau de bord d'administration (page espace-client-admin.html).
// Validation des inscriptions (Kbis, SIRET), projets, devis, factures, documents et messagerie de tous les clients.
// Réservé aux e-mails listés dans la table « admins » (voir supabase/schema.sql).
(function () {
  var root = document.querySelector('[data-ec-admin]');
  if (!root) return;
  function start() {
    var E = window.AchaEspace;
    if (!E) return;
    var sb = E.sb, h = E.h, alertBox = E.alertBox, busy = E.busy, date = E.date, eur = E.eur, kpi = E.kpi, secHead = E.secHead, empty = E.empty, total = E.total;
    var LABELS = { a_completer: 'Kbis manquant', en_attente: 'À valider', valide: 'Validé', refuse: 'Refusé' };
    var espaceUrl = location.origin + location.pathname.replace(/espace-client-admin(\.html)?$/, 'espace-client$1');
    var A = null; // toutes les données, rechargées après chaque modification
    var me = { email: '', prenom: '' };

    function login(msg) {
      var err = h('div');
      var email = h('input', { type: 'email', autocomplete: 'email', required: true });
      var pass = h('input', { type: 'password', autocomplete: 'current-password', required: true });
      var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Se connecter' });
      A = null;
      root.replaceChildren(h('div', { class: 'ec-card ec-narrow' }, [h('p', { class: 'label', text: 'Administration' }), h('h1', { class: 'ec-title sm', text: 'Connexion' }),
        msg ? alertBox(msg) : null,
        h('form', { class: 'ec-form', onsubmit: function (e) {
          e.preventDefault(); busy(btn, true, 'Se connecter');
          sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }).then(function (r) {
            busy(btn, false, 'Se connecter');
            if (r.error) err.replaceChildren(alertBox(E.frError(r.error))); else boot();
          });
        } }, [h('label', { class: 'f' }, ['E-mail', email]), h('label', { class: 'f' }, ['Mot de passe', pass]), err, btn]),
        h('p', { class: 'ec-hint', text: 'Utilisez le compte créé sur /espace-client avec votre e-mail d\'administratrice.' })]));
    }
    function logout() { sb.auth.signOut().then(function () { history.replaceState(null, '', location.pathname); login(); }); }

    function boot() {
      sb.auth.getSession().then(function (s) {
        if (!s.data.session) return login();
        me.email = s.data.session.user.email;
        sb.rpc('is_admin').then(function (r) {
          if (!r.data) return sb.auth.signOut().then(function () { login('Ce compte n\'a pas accès à l\'administration.'); });
          root.replaceChildren(h('p', { class: 'ec-loading', text: 'Chargement…' }));
          reload().then(function () { render(true); });
        });
      });
    }

    function reload() {
      return Promise.all([
        sb.from('profiles').select('*').order('created_at', { ascending: false }),
        sb.from('admins').select('email'),
        sb.from('projets').select('*').order('updated_at', { ascending: false }),
        sb.from('documents').select('*').order('created_at', { ascending: false }),
        sb.from('messages').select('*').order('created_at')
      ]).then(function (res) {
        var admins = (res[1].data || []).map(function (a) { return a.email.toLowerCase(); });
        var all = res[0].data || [];
        var mine = all.find(function (p) { return p.email.toLowerCase() === me.email.toLowerCase(); });
        me.prenom = mine ? mine.prenom : '';
        var clients = all.filter(function (p) { return admins.indexOf(p.email.toLowerCase()) < 0; });
        var byId = {};
        clients.forEach(function (c) { byId[c.id] = c; });
        A = { clients: clients, byId: byId, projets: res[2].data || [], docs: res[3].data || [], msgs: res[4].data || [] };
      });
    }
    function refresh() { return reload().then(function () { render(false); }); }

    // ---------- petits calculs ----------
    function nom(id) { var c = A.byId[id]; return c ? (c.societe || c.email) : 'Client supprimé'; }
    function byStatut(s) { return A.clients.filter(function (c) { return c.statut === s; }); }
    function docs(type, statut) { return A.docs.filter(function (d) { return d.type === type && (statut == null || d.statut === statut); }); }
    function convs() {
      var m = {};
      A.msgs.forEach(function (x) { (m[x.client_id] = m[x.client_id] || []).push(x); });
      return Object.keys(m).map(function (id) { var l = m[id]; return { id: id, list: l, last: l[l.length - 1] }; })
        .sort(function (a, b) { return a.last.created_at < b.last.created_at ? 1 : -1; });
    }
    function aRepondre() { return convs().filter(function (c) { return c.last.auteur === 'client'; }); }
    function plural(n, w) { return n + ' ' + w + (n > 1 ? 's' : ''); }

    // ---------- listes réutilisées ----------
    function clientList(items, emptyText) {
      if (!items.length) return empty(emptyText || 'Aucun client.');
      return h('ul', { class: 'ec-clients' }, items.map(function (p) {
        var n = A.projets.filter(function (pr) { return pr.client_id === p.id; }).length;
        return h('li', {}, [h('a', { class: 'ec-client', href: '#client/' + p.id }, [
          h('span', {}, [h('b', { text: p.societe || '(sans nom)' }), h('small', { text: p.prenom + ' ' + p.nom + ' · ' + p.email })]),
          h('span', { class: 'ec-badge p-' + p.statut, text: LABELS[p.statut] }),
          h('small', { text: (n ? plural(n, 'projet') + ' · ' : '') + 'inscrit le ' + date(p.created_at) })])]);
      }));
    }
    function convList(items, active) {
      if (!items.length) return empty('Aucune conversation.');
      return h('ul', { class: 'ec-convs' }, items.map(function (c) {
        var txt = c.last ? c.last.contenu : 'Aucun message, écrivez le premier.';
        return h('li', {}, [h('a', { href: '#messagerie/' + c.id, class: c.id === active ? 'on' : null }, [
          h('span', { class: 'ec-conv-top' }, [h('b', { text: nom(c.id) }), c.last ? h('small', { text: E.dateTime(c.last.created_at) }) : null]),
          h('span', { class: 'ec-conv-txt', text: (c.last && c.last.auteur === 'acha' ? 'Vous : ' : '') + txt }),
          c.last && c.last.auteur === 'client' ? h('span', { class: 'ec-badge p-en_attente', text: 'À répondre' }) : null])]);
      }));
    }
    function pipeCard(pr) {
      return h('a', { class: 'ec-pipe-card', href: '#client/' + pr.client_id }, [h('b', { text: pr.titre }), h('small', { text: nom(pr.client_id) }),
        E.bar(pr.progression), h('small', { text: pr.progression + ' %' + (pr.echeance ? ' · en ligne le ' + date(pr.echeance) : '') })]);
    }
    function pipeline(list) {
      return h('div', { class: 'ec-pipe' }, E.ETAPES.map(function (n, i) {
        var col = list.filter(function (pr) { return pr.etape === i + 1; });
        return h('div', { class: 'ec-pipe-col' }, [h('p', { class: 'ec-pipe-title' }, [h('span', { text: '0' + (i + 1) }), n, h('b', { text: String(col.length) })])]
          .concat(col.length ? col.map(pipeCard) : [h('p', { class: 'ec-hint', text: 'Aucun projet' })]));
      }));
    }
    function statutSelect(d) {
      var opts = E.DOC_STATUTS[d.type] || [];
      if (!opts.length) return null;
      if (d.statut && opts.indexOf(d.statut) < 0) opts = [d.statut].concat(opts);
      var sel = h('select', { 'aria-label': 'État de ' + d.nom, onchange: function () {
        sb.from('documents').update({ statut: sel.value }).eq('id', d.id).then(refresh);
      } }, (d.statut ? [] : [h('option', { value: '', text: '—' })]).concat(opts.map(function (o) { return h('option', { value: o, selected: o === d.statut, text: o }); })));
      return sel;
    }
    function adminDocRow(d, withClient) {
      return h('li', { class: 'ec-doc' }, [h('span', { class: 'ec-badge t-' + d.type, text: E.TYPES[d.type] || d.type }),
        h('span', { class: 'ec-doc-name' }, [h('b', { text: d.nom }), h('small', {}, [withClient ? h('a', { href: '#client/' + d.client_id, text: nom(d.client_id) }) : null, (withClient ? ' · ' : '') + date(d.created_at)])]),
        h('span', { class: 'ec-doc-amount', text: d.montant != null ? eur.format(d.montant) : '' }),
        h('span', { class: 'ec-doc-act' }, [statutSelect(d), E.download(d), h('button', { class: 'ec-textbtn danger', type: 'button', text: 'Supprimer', onclick: function () {
          if (!confirm('Supprimer « ' + d.nom + ' » ?')) return;
          sb.storage.from('documents').remove([d.chemin]).then(function () { return sb.from('documents').delete().eq('id', d.id); }).then(refresh);
        } })])]);
    }

    // Ajout d'un devis, d'une facture ou d'un document (client imposé, ou à choisir parmi les clients validés).
    function addDoc(fixed, defType, label) {
      var valides = byStatut('valide');
      if (!fixed && !valides.length) return h('p', { class: 'ec-hint', text: 'Validez d\'abord un client pour lui envoyer des documents.' });
      var who = fixed ? null : h('select', { required: true }, [h('option', { value: '', text: 'Choisir un client' })].concat(valides.map(function (c) { return h('option', { value: c.id, text: c.societe || c.email }); })));
      var type = h('select', {}, Object.keys(E.TYPES).map(function (k) { return h('option', { value: k, selected: k === defType, text: E.TYPES[k] }); }));
      var statut = h('select', {});
      function fillStatut() { statut.replaceChildren.apply(statut, (E.DOC_STATUTS[type.value].length ? E.DOC_STATUTS[type.value] : ['']).map(function (o) { return h('option', { value: o, text: o || '—' }); })); }
      type.addEventListener('change', fillStatut); fillStatut();
      var nomDoc = h('input', { required: true, placeholder: 'Ex. : Devis boutique en ligne' });
      var montant = h('input', { type: 'number', step: '0.01', min: 0, placeholder: 'Montant TTC (facultatif)' });
      var file = h('input', { type: 'file', required: true });
      var err = h('div');
      var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Ajouter' });
      var form = h('form', { class: 'ec-form', onsubmit: function (e) {
        e.preventDefault(); err.replaceChildren();
        var cid = fixed ? fixed.id : who.value;
        var fl = file.files[0]; if (!fl || !cid) return;
        if (fl.size > 20 * 1024 * 1024) { err.append(alertBox('20 Mo maximum.')); return; }
        busy(btn, true, 'Ajouter');
        var safe = fl.name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80);
        var path = cid + '/' + Date.now() + '-' + safe;
        sb.storage.from('documents').upload(path, fl, { contentType: fl.type || 'application/octet-stream' }).then(function (r) {
          if (r.error) throw r.error;
          return sb.from('documents').insert({ client_id: cid, type: type.value, nom: nomDoc.value.trim(), chemin: path, montant: montant.value ? +montant.value : null, statut: statut.value });
        }).then(function (r) { if (r.error) throw r.error; refresh(); })
          .catch(function (e2) { busy(btn, false, 'Ajouter'); err.append(alertBox(E.frError(e2))); });
      } }, [who ? h('label', { class: 'f' }, ['Client', who]) : null,
        h('div', { class: 'ec-row2' }, [h('label', { class: 'f' }, ['Type', type]), h('label', { class: 'f' }, ['Nom affiché', nomDoc])]),
        h('div', { class: 'ec-row2' }, [h('label', { class: 'f' }, ['Montant', montant]), h('label', { class: 'f' }, ['État', statut])]),
        h('label', { class: 'f' }, ['Fichier (20 Mo maximum)', file]), err, btn]);
      return h('details', { class: 'ec-add' }, [h('summary', { class: 'btn primary', text: '+ ' + (label || 'Ajouter un document') }), form]);
    }

    // ---------- pages ----------
    var VIEWS = {
      'tableau-de-bord': function () {
        var w = byStatut('en_attente'), actifs = byStatut('valide');
        var enCours = A.projets.filter(function (pr) { return pr.statut === 'en_cours'; });
        var devis = docs('devis', 'à signer'), fa = docs('facture', 'à payer'), fp = docs('facture', 'payée');
        var rep = aRepondre();
        return { title: 'Bonjour' + (me.prenom ? ' ' + me.prenom : ''), body: h('div', { class: 'ec-stack' }, [
          h('div', { class: 'ec-kpis' }, [
            kpi('Comptes à valider', w.length, w.length ? 'Kbis à vérifier' : 'Tout est à jour', '#validation', w.length ? 'warn' : ''),
            kpi('Clients actifs', actifs.length, plural(A.clients.length, 'compte') + ' au total', '#clients'),
            kpi('Projets en cours', enCours.length, plural(A.projets.filter(function (pr) { return pr.statut === 'termine'; }).length, 'projet') + ' terminé' + (A.projets.filter(function (pr) { return pr.statut === 'termine'; }).length > 1 ? 's' : ''), '#projets', 'acc'),
            kpi('Devis à signer', devis.length, eur.format(total(devis)), '#devis'),
            kpi('À encaisser', eur.format(total(fa)), plural(fa.length, 'facture') + ' à payer', '#factures', fa.length ? 'warn' : ''),
            kpi('Encaissé', eur.format(total(fp)), plural(fp.length, 'facture') + ' payée' + (fp.length > 1 ? 's' : ''), '#factures', 'ok'),
            kpi('Messages à traiter', rep.length, rep.length ? 'En attente de votre réponse' : 'Tout est répondu', '#messagerie', rep.length ? 'acc' : '')]),
          h('section', { class: 'ec-block' }, [secHead('Projets en cours, par étape', '#projets'), pipeline(enCours)]),
          h('div', { class: 'ec-dash' }, [
            h('section', { class: 'ec-block' }, [secHead('Comptes à valider', w.length ? '#validation' : null), clientList(w.slice(0, 5), 'Aucun compte en attente.')]),
            h('section', { class: 'ec-block' }, [secHead('Messages à traiter', '#messagerie', 'Messagerie'), rep.length ? convList(rep.slice(0, 5)) : empty('Aucun message en attente.')])])])};
      },
      validation: function () {
        return { title: 'Validation des comptes', body: h('div', { class: 'ec-stack' }, [
          h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'À valider (' + byStatut('en_attente').length + ')' }), clientList(byStatut('en_attente'), 'Aucun compte en attente.')]),
          h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'Kbis pas encore déposé (' + byStatut('a_completer').length + ')' }), clientList(byStatut('a_completer'), 'Aucun.')]),
          h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'Refusés ou suspendus (' + byStatut('refuse').length + ')' }), clientList(byStatut('refuse'), 'Aucun.')])]) };
      },
      clients: function () {
        var box = h('div', {}, [clientList(A.clients)]);
        var q = h('input', { type: 'search', placeholder: 'Rechercher une société, un nom, un e-mail, un SIRET…', 'aria-label': 'Rechercher un client', oninput: function () {
          var s = q.value.trim().toLowerCase();
          box.replaceChildren(clientList(A.clients.filter(function (c) { return !s || [c.societe, c.prenom, c.nom, c.email, c.siret].join(' ').toLowerCase().indexOf(s) >= 0; }), 'Aucun résultat.'));
        } });
        return { title: 'Tous les clients', body: h('section', { class: 'ec-block' }, [h('div', { class: 'ec-search' }, [q]), box]) };
      },
      client: function (id) {
        var p = A.byId[id];
        if (!p) return VIEWS.clients();
        var mine = function (l) { return l.filter(function (x) { return x.client_id === id; }); };
        return { active: 'clients', title: p.societe || 'Client', actions: [h('a', { class: 'btn ghost', href: '#clients', text: '← Tous les clients' })],
          body: h('div', { class: 'ec-dash' }, [dossier(p), projets(p, mine(A.projets)), documents(p, mine(A.docs)), messages(p, mine(A.msgs))]) };
      },
      projets: function () {
        var by = function (s) { return A.projets.filter(function (pr) { return pr.statut === s; }); };
        var grid = function (l, t) { return l.length ? h('div', { class: 'ec-pipe-grid' }, l.map(pipeCard)) : empty(t); };
        return { title: 'Projets', body: h('div', { class: 'ec-stack' }, [
          h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'En cours (' + by('en_cours').length + ')' }), pipeline(by('en_cours')),
            h('p', { class: 'ec-hint', text: 'Pour créer un projet ou le faire avancer d\'étape, ouvrez la fiche du client.' })]),
          h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'En pause (' + by('en_pause').length + ')' }), grid(by('en_pause'), 'Aucun projet en pause.')]),
          h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'Terminés (' + by('termine').length + ')' }), grid(by('termine'), 'Aucun projet terminé.')])]) };
      },
      devis: function () { return finance('devis', 'Devis', 'Ajouter un devis'); },
      factures: function () { return finance('facture', 'Factures', 'Ajouter une facture'); },
      documents: function () {
        var l = docs('document');
        return { title: 'Documents', body: h('section', { class: 'ec-block' }, [addDoc(null, 'document', 'Ajouter un document'),
          l.length ? h('ul', { class: 'ec-docs' }, l.map(function (d) { return adminDocRow(d, true); })) : empty('Plans d\'action, rapports, guides : aucun document pour le moment.')]) };
      },
      messagerie: function (id) {
        var list = convs();
        var seen = {};
        list.forEach(function (c) { seen[c.id] = 1; });
        byStatut('valide').forEach(function (c) { if (!seen[c.id]) list.push({ id: c.id, list: [], last: null }); });
        var cur = list.find(function (c) { return c.id === id; }) || list[0];
        return { title: 'Messagerie', body: list.length ? h('div', { class: 'ec-inbox' }, [
          h('section', { class: 'ec-block' }, [convList(list, cur && cur.id)]),
          cur ? messages(A.byId[cur.id] || { id: cur.id, societe: nom(cur.id) }, cur.list, true) : null]) : h('section', { class: 'ec-block' }, [empty('Aucune conversation : les messages de vos clients validés apparaîtront ici.')]) };
      }
    };

    function finance(type, title, addLabel) {
      var list = docs(type);
      var sums = E.DOC_STATUTS[type].map(function (s) {
        var l = list.filter(function (d) { return d.statut === s; });
        return h('span', { class: 'ec-sum' }, [s.charAt(0).toUpperCase() + s.slice(1) + ' : ', h('b', { text: eur.format(total(l)) }), ' · ' + l.length]);
      });
      return { title: title, body: h('section', { class: 'ec-block' }, [h('div', { class: 'ec-sums' }, sums), addDoc(null, type, addLabel),
        list.length ? h('ul', { class: 'ec-docs' }, list.map(function (d) { return adminDocRow(d, true); })) : empty('Aucun document pour le moment.')]) };
    }

    // ---------- fiche client ----------
    function dossier(p) {
      var verif = h('p', { class: 'ec-hint', 'aria-live': 'polite' });
      var motif = h('input', { placeholder: 'Motif du refus (affiché au client)' });
      var err = h('div');
      function setStatut(statut) {
        if (statut === 'refuse' && !motif.value.trim()) { err.replaceChildren(alertBox('Indiquez le motif du refus.')); motif.focus(); return; }
        var upd = { statut: statut, motif_refus: statut === 'refuse' ? motif.value.trim() : null, validated_at: statut === 'valide' ? new Date().toISOString() : null };
        sb.from('profiles').update(upd).eq('id', p.id).then(function (r) { if (r.error) err.replaceChildren(alertBox(E.frError(r.error))); else refresh(); });
      }
      var mail = 'mailto:' + encodeURIComponent(p.email) + '?subject=' + encodeURIComponent(p.statut === 'refuse' ? 'Votre espace client ' + E.MARQUE : 'Votre espace client ' + E.MARQUE + ' est ouvert') +
        '&body=' + encodeURIComponent(p.statut === 'refuse'
          ? 'Bonjour ' + p.prenom + ',\n\nNous n\'avons pas pu valider votre dossier : ' + (p.motif_refus || '') + '\nVous pouvez déposer un nouveau Kbis sur ' + espaceUrl + '.\n\nL\'équipe ' + E.MARQUE
          : 'Bonjour ' + p.prenom + ',\n\nVotre compte professionnel est validé. Vous pouvez suivre votre projet sur ' + espaceUrl + ' avec vos identifiants.\n\nÀ très vite,\nL\'équipe ' + E.MARQUE);
      return h('section', { class: 'ec-block ec-span' }, [h('h2', { class: 'ec-h2', text: 'Dossier' }),
        h('dl', { class: 'ec-dl' }, [
          h('dt', { text: 'Statut' }), h('dd', {}, [h('span', { class: 'ec-badge p-' + p.statut, text: LABELS[p.statut] }), p.motif_refus ? ' ' + p.motif_refus : '']),
          h('dt', { text: 'Contact' }), h('dd', { text: p.prenom + ' ' + p.nom }),
          h('dt', { text: 'E-mail' }), h('dd', {}, [h('a', { href: 'mailto:' + p.email, text: p.email })]),
          h('dt', { text: 'Téléphone' }), h('dd', { text: p.telephone || '—' }),
          h('dt', { text: 'SIRET' }), h('dd', {}, [p.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4') + ' ',
            h('button', { class: 'ec-textbtn', type: 'button', text: 'Vérifier dans le registre', onclick: function () {
              verif.textContent = 'Vérification…';
              E.lookupSiret(p.siret).then(function (r) {
                verif.className = 'ec-hint ' + (r.found && r.actif ? 'ok' : 'bad');
                verif.textContent = !r.found ? 'Introuvable dans le registre.' : (r.actif ? '✓ ' : '✗ Fermé : ') + r.nom + (r.adresse ? ' · ' + r.adresse : '');
              }).catch(function () { verif.textContent = 'Registre indisponible, réessayez plus tard.'; });
            } }), verif]),
          h('dt', { text: 'Kbis' }), h('dd', {}, [p.kbis_path ? h('button', { class: 'ec-textbtn', type: 'button', text: 'Ouvrir le Kbis', onclick: function () {
            sb.storage.from('kbis').createSignedUrl(p.kbis_path, 300).then(function (r) { if (r.data) window.open(r.data.signedUrl, '_blank', 'noopener'); });
          } }) : 'pas encore déposé']),
          h('dt', { text: 'Inscription' }), h('dd', { text: date(p.created_at) + (p.validated_at ? ' · validé le ' + date(p.validated_at) : '') })
        ]),
        h('div', { class: 'ec-actions' }, [
          p.statut !== 'valide' ? h('button', { class: 'btn primary', type: 'button', text: 'Valider le client', disabled: !p.kbis_path, onclick: function () { setStatut('valide'); } }) : null,
          p.statut !== 'refuse' ? h('div', { class: 'ec-refuse' }, [motif, h('button', { class: 'btn ghost', type: 'button', text: p.statut === 'valide' ? 'Suspendre' : 'Refuser', onclick: function () { setStatut('refuse'); } })]) : null,
          p.statut === 'valide' || p.statut === 'refuse' ? h('a', { class: 'btn ghost', href: mail, text: 'Prévenir le client par e-mail' }) : null
        ]), err]);
    }

    function projets(p, items) {
      var titre = h('input', { required: true, placeholder: 'Ex. : Boutique en ligne sur thème' });
      var desc = h('input', { placeholder: 'Description courte (facultatif)' });
      var ech = h('input', { type: 'date' });
      return h('section', { class: 'ec-block ec-span' }, [h('h2', { class: 'ec-h2', text: 'Projets' }),
        items.length ? h('div', { class: 'ec-projets' }, items.map(function (pr) { return projetEdit(pr); })) : empty('Aucun projet.'),
        p.statut === 'valide' ? h('form', { class: 'ec-form ec-inline', onsubmit: function (e) {
          e.preventDefault();
          sb.from('projets').insert({ client_id: p.id, titre: titre.value.trim(), description: desc.value.trim(), echeance: ech.value || null }).then(refresh);
        } }, [h('label', { class: 'f' }, ['Nouveau projet', titre]), h('label', { class: 'f' }, ['Description', desc]), h('label', { class: 'f' }, ['Mise en ligne prévue', ech]),
          h('button', { class: 'btn primary', type: 'submit', text: 'Créer le projet' })]) : h('p', { class: 'ec-hint', text: 'Validez le client pour lui créer un projet.' })]);
    }

    function projetEdit(pr) {
      var statut = h('select', {}, Object.keys(E.STATUTS).map(function (k) { return h('option', { value: k, selected: k === pr.statut, text: E.STATUTS[k] }); }));
      var etape = h('select', {}, E.ETAPES.map(function (n, i) { return h('option', { value: i + 1, selected: i + 1 === pr.etape, text: '0' + (i + 1) + ' ' + n }); }));
      var prog = h('input', { type: 'range', min: 0, max: 100, step: 5, value: pr.progression });
      var progOut = h('output', { text: pr.progression + ' %' });
      prog.addEventListener('input', function () { progOut.textContent = prog.value + ' %'; });
      var ech = h('input', { type: 'date', value: pr.echeance || '' });
      var saved = h('span', { class: 'ec-hint' });
      return h('div', { class: 'ec-edit' }, [E.projetCard(pr),
        h('form', { class: 'ec-form ec-inline', onsubmit: function (e) {
          e.preventDefault();
          sb.from('projets').update({ statut: statut.value, etape: +etape.value, progression: +prog.value, echeance: ech.value || null, updated_at: new Date().toISOString() }).eq('id', pr.id)
            .then(function (r) { if (r.error) saved.textContent = 'Erreur'; else refresh(); });
        } }, [h('label', { class: 'f' }, ['Statut', statut]), h('label', { class: 'f' }, ['Étape', etape]), h('label', { class: 'f' }, [h('span', {}, ['Avancement ', progOut]), prog]),
          h('label', { class: 'f' }, ['Mise en ligne prévue', ech]), h('button', { class: 'btn primary', type: 'submit', text: 'Mettre à jour' }), saved,
          h('button', { class: 'ec-textbtn danger', type: 'button', text: 'Supprimer le projet', onclick: function () {
            if (confirm('Supprimer le projet « ' + pr.titre + ' » ?')) sb.from('projets').delete().eq('id', pr.id).then(refresh);
          } })])]);
    }

    function documents(p, items) {
      return h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'Devis, factures et documents' }),
        p.statut === 'valide' ? addDoc(p, 'devis', 'Ajouter') : null,
        items.length ? h('ul', { class: 'ec-docs' }, items.map(function (d) { return adminDocRow(d, false); })) : empty('Aucun document.')]);
    }

    function messages(p, items, titled) {
      var text = h('textarea', { rows: 3, required: true, maxlength: 5000, placeholder: 'Votre réponse…' });
      return h('section', { class: 'ec-block' }, [titled ? secHead(p.societe || 'Client', '#client/' + p.id, 'Fiche client') : h('h2', { class: 'ec-h2', text: 'Messages' }), E.thread(items, 'acha'),
        h('form', { class: 'ec-form ec-send', onsubmit: function (e) {
          e.preventDefault();
          var v = text.value.trim(); if (!v) return;
          sb.from('messages').insert({ client_id: p.id, auteur: 'acha', contenu: v }).then(refresh);
        } }, [h('label', { class: 'f' }, ['Répondre', text]), h('button', { class: 'btn primary', type: 'submit', text: 'Envoyer' })])]);
    }

    // ---------- menu et affichage ----------
    function nav() {
      return [
        { title: 'Pilotage', items: [{ id: 'tableau-de-bord', label: 'Tableau de bord', icon: 'grid' }] },
        { title: 'Clients', items: [{ id: 'validation', label: 'Comptes à valider', icon: 'valider', badge: byStatut('en_attente').length },
          { id: 'clients', label: 'Tous les clients', icon: 'clients' }] },
        { title: 'Production', items: [{ id: 'projets', label: 'Projets', icon: 'projet' }] },
        { title: 'Finances', items: [{ id: 'devis', label: 'Devis', icon: 'devis', badge: docs('devis', 'à signer').length },
          { id: 'factures', label: 'Factures', icon: 'facture', badge: docs('facture', 'à payer').length }] },
        { title: 'Relation client', items: [{ id: 'messagerie', label: 'Messagerie', icon: 'msg', badge: aRepondre().length },
          { id: 'documents', label: 'Documents', icon: 'doc' }] },
        { title: 'Site', items: [{ id: 'site', label: 'Voir le site', icon: 'site', href: '/' }] }];
    }
    function render(top) {
      var parts = location.hash.slice(1).split('/');
      var id = VIEWS[parts[0]] ? parts[0] : 'tableau-de-bord';
      var v = VIEWS[id](parts[1]);
      root.replaceChildren(E.shell({ label: 'Administration', who: me.prenom || 'Administration', whoSub: me.email, nav: nav(), active: v.active || id,
        kicker: E.COURT + ' · Administration', title: v.title, actions: v.actions, body: v.body, logout: logout }));
      if (top) window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', function () { if (A) render(true); });

    boot();
  }
  if (window.AchaEspace) start(); else document.addEventListener('acha-espace-pret', start);
})();

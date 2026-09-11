# DealBot — intégration Supabase

Reprise du dépôt existant, uniquement sur `supabase-integration`, à partir du commit `afb7a785bd3ce928abe62f6259fee1e4a5be8c55`. L'interface et sa navigation sont conservées. Le JavaScript auparavant intégré dans `index.html` est déplacé dans `app.js`; `backend.js` centralise les appels et la normalisation.

## Fonctionnement

- Catalogue Supabase réel, sans substitution par des offres fictives. États de chargement, absence de données, erreur et nouvelle tentative.
- Recherche, filtres par devise, catégorie, vendeur, prix, réduction et score; fiches avec historique réel, images HTTPS et liens directs.
- Supabase Auth : inscription, connexion, déconnexion, restauration du compte, formulaire de récupération de mot de passe et édition du profil.
- Favoris, comparaisons et alertes liés au compte, sauvegardés par une transaction SQL soumise aux RLS. Les anciennes données de démonstration locales ne sont pas importées dans des identifiants réels.
- Comparaison limitée à quatre offres; l'interface refuse la comparaison de devises différentes.
- Alertes déclenchées en base après modification du prix/disponibilité. Consultation dans le compte à son chargement ou au retour sur l'onglet. Aucun email ou push d'alerte n'est envoyé.
- Admin réservé au rôle stocké en base : création/modification d'offres, brouillon, publication, pause, expiration et archivage. Un lien HTTPS est nécessaire pour publier. Historique et journal d'audit conservés.
- Tracking des redirections marchandes en base, validation de la destination, limite par session, sans connexion à Admitad. La limite par session n'est pas une protection complète contre des bots distribués.
- Formulaire de contact authentifié : messages enregistrés, lisibles dans l'admin, cinq messages par heure. Ce formulaire n'envoie pas d'email.
- L'emplacement publicitaire d'accueil affiche les publicités actives de `ads` rattachées à `ad_slots` (`home_top`). Administration des publicités et des autres tables dans Supabase; aucune régie externe n'est connectée.

## Base existante

Projet : `rrcxlohsbxfldflqfgqx`. Les scripts suivants ont été appliqués, dans cet ordre, par l'historique de migrations distant :

1. `supabase/production.sql` — `dealbot_production_integration`.
2. `supabase/contact_and_limits.sql` — `dealbot_contact_and_limits`.
3. `supabase/alert_integrity.sql` — `dealbot_alert_integrity`.
4. `supabase/migrations/20260909101046_dealbot_alert_currency.sql` — `dealbot_alert_currency`, ajoutée après `09b818a` : actualisation de la devise à la réédition d’une alerte, même à montant identique. Une alerte portant explicitement une ancienne devise est conservée lors d’une autre sauvegarde. L’ancien format de requête de `09b818a` reste accepté.

Ne pas les rejouer sur ce projet : les migrations sont déjà enregistrées. Le dépôt initial ne contenait pas de migration du schéma de base; ces scripts complètent ce schéma et ne créent pas un nouveau projet.

RLS maintenues sur toutes les tables exposées; suppression des privilèges TRUNCATE/REFERENCES/TRIGGER inutiles; modification des rôles refusée au client; fonctions privilégiées auxiliaires isolées dans `private`; statut de déclenchement des alertes réservé au serveur.

`dealbot-sync` version 3 est conservé sans modification : il contrôle l'accès aux tables, mais ne réalise pas encore d'import d'offres. Aucun connecteur affilié n'a été ajouté. Le catalogue réel était vide pendant l'inspection : aucune offre marchande fictive n'a été insérée.

## Vérification effectuée

- `npm ci --ignore-scripts` puis `npm test` : 19 tests d'interface et de logique passent. JSDOM et un backend simulé vérifient les interactions; ces tests ne constituent pas un contrôle visuel dans Chrome ni une validation des emails réels.
- `tests/database.sql` exécuté sur Supabase : isolation entre comptes, refus d'accès admin et de changement de rôle, édition du profil, sauvegarde atomique, comparaison, redirection, expiration, déclenchement d'alerte, historique, archivage, audit et limite de contact. Toutes les données de test sont annulées par ROLLBACK.
- `python tests/rest-smoke.py` : six appels réels en lecture seule à l'API publique passent. Les données privées ne sont pas exposées au visiteur.
- Analyse syntaxique Node de `app.js` et `backend.js`.

Le navigateur de cette session a refusé `http://localhost:3000` (`ERR_BLOCKED_BY_CLIENT`). Le contrôle visuel desktop/mobile et les parcours authentifiés dans un vrai navigateur restent à effectuer sur une preview accessible.

## Lancement local

Node.js et npm sont nécessaires. `npm ci --ignore-scripts`, puis `npm start`; ouvrir `http://localhost:3000`. L'application utilise la base existante, pas une base de test. Ne pas publier de fausses offres pour tester visuellement.

Le SDK navigateur Supabase `2.116.0` est conservé dans `vendor/` avec sa licence. Aucune clé serveur n'est incluse : seule la clé publique déjà présente dans le projet est utilisée par le client.

## Conditions restant à vérifier avant production

- Accès Vercel à l'espace `botdeal` : le connecteur renvoie 403. Aucune nouvelle version n'a été déployée ni aucune protection de preview vérifiée.
- Vérifier que la branche de production Vercel est `main`, et que toute preview de `supabase-integration` reste privée avant de pousser/déployer. Ne pas fusionner vers `main` sans accord.
- Dans Supabase Auth, vérifier l'URL du site et autoriser exactement l'URL de preview retenue pour les emails de confirmation/récupération. Tester la réception et l'utilisation du lien avec une adresse autorisée. Aucun réglage d'email ni service payant n'a été changé.
- L'analyse Supabase signale encore la protection contre les mots de passe compromis désactivée. Vérifier sa disponibilité dans le forfait existant sans souscrire à une option payante. [Documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Ajouter des offres réelles vérifiées par l'admin. Les scores sont éditoriaux; aucune prédiction artificielle de prix n'est affichée.
- Le chargement du catalogue est paginé par lots de 500 avec une limite explicite de 10 000; pour un catalogue plus grand, déplacer recherche et pagination côté serveur.

Les styles responsive existants sont conservés, avec corrections de visibilité des éléments `hidden`, gestion du focus des fenêtres, limites d'images et défilement des fenêtres sur mobile. La traduction intégrale de tous les textes statiques en anglais reste à compléter.

## Suite de la référence `09b818a`

Les corrections suivantes prolongent ce commit sans le réécrire :

- Une notification `SIGNED_IN` du même compte ne vide plus les sélections et n’annule plus les sauvegardes en attente. [Comportement Supabase documenté](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
- Une lecture lancée au retour sur l’onglet ne remplace plus une modification plus récente. La déconnexion vide immédiatement l’affichage personnel, même si le catalogue tarde à répondre.
- Les alertes d’offres indisponibles restent visibles et supprimables. Les seuils conservent leur devise et ne sont pas comparés à un prix d’une autre devise.
- Le scénario SQL couvre aussi la tentative de rôle admin dans les métadonnées d’inscription, le refus de tracking d’une offre expirée, le 31e clic en une minute et la réédition d’une alerte après changement de devise. Le défaut de réédition a été reproduit avant migration, puis le scénario complet a passé après correction ; toutes les données de test ont été annulées.

Au contrôle du 9 septembre 2026, les empreintes MD5 du SQL des trois migrations de référence correspondent exactement aux fichiers de `09b818a` : `f3b07e6da6d90f5a69f6704f72d61cbb`, `ee447437632b08bc6ae49e1ca7f827a3`, `5d7e5b376aa10955bbf7fb141d2c760b` (ordre ci-dessus). Les 14 tables publiques ont RLS activée. La quatrième migration a été appliquée via Supabase ; son fichier porte la version effectivement enregistrée à distance.

La branche GitHub était encore sur `afb7a78` lors de ce contrôle. Le transfert de la suite conserve `09b818a` comme parent ; il ne prouve pas un push. Aucun déploiement, merge, connexion Admitad ou achat n’a été effectué. Les conditions de validation en production indiquées ci-dessus restent à satisfaire.

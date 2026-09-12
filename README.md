# DealBot — intégration Supabase

État Autopilot actuel : [assemblage multipart, test HTTP réel, charge et rétention](AUTOPILOT-CONNECTION-READINESS.md). Les anciens audits ci-dessous restent des états historiques.

**Autopilot — suite de `2a7bc9d` :** le moteur d'import, le score automatique, la file durable et le worker Supabase Cron sont maintenant implémentés. Voir [validation et limites actuelles](AUTOPILOT-VALIDATION.md) et [contrat des adaptateurs](supabase/functions/dealbot-sync/CONTRACT.md). Les sections ci-dessous décrivent aussi les états historiques antérieurs où sync ne faisait qu'un contrôle de base.

État détaillé le plus récent : [audit du 12 septembre 2026 depuis 652c3d0](AUDIT-2026-09-12.md). Il distingue tests simulés, vérifications Supabase réelles et limites d'accès navigateur. La preview existe et demande une connexion Vercel malgré le 403 du connecteur. Le source distant de `dealbot-sync` v3 est maintenant versionné sans redéploiement ; il n'importe toujours aucune offre. Les tests d'audit utilisent Node 24 (36 tests).

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

5. `supabase/migrations/20260911222123_dealbot_admin_offer_integrity.sql` — `dealbot_admin_offer_integrity` : conservation du vendeur existant, liens indépendants, dates et mise en avant.

6. `supabase/migrations/20260912043248_dealbot_personal_conflict_guard.sql` — `dealbot_personal_conflict_guard` : sauvegarde conditionnelle atomique contre les écrasements entre appareils.

Ne pas les rejouer sur ce projet : les migrations sont déjà enregistrées. Le dépôt initial ne contenait pas de migration du schéma de base; ces scripts complètent ce schéma et ne créent pas un nouveau projet.

RLS maintenues sur toutes les tables exposées; suppression des privilèges TRUNCATE/REFERENCES/TRIGGER inutiles; modification des rôles refusée au client; fonctions privilégiées auxiliaires isolées dans `private`; statut de déclenchement des alertes réservé au serveur.

`dealbot-sync` version 3 est conservé sans modification : il contrôle l'accès aux tables, mais ne réalise pas encore d'import d'offres. Aucun connecteur affilié n'a été ajouté. Le catalogue réel était vide pendant l'inspection : aucune offre marchande fictive n'a été insérée.

## Vérification effectuée

- `npm ci --ignore-scripts` puis `npm test` : 31 tests d'interface et de logique passent. JSDOM et un backend simulé vérifient les interactions; ces tests ne constituent pas un contrôle visuel dans Chrome ni une validation des emails réels.
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

## Transfert GitHub et sélections indisponibles — 11 septembre 2026

Le connecteur GitHub a transféré la référence `7037dbc` sur `supabase-integration` sous le commit `9596e4d198fdf314e8d2ce5cbcf9b14ebcec4e8d`. Les deux arbres Git ont exactement la même empreinte `a37827c3d1644b6bbe43a09a8c3011e48d186400` : le code est identique, seules les métadonnées de commit diffèrent. Aucun merge ni modification de `main`.

La suite rend supprimables les favoris et comparaisons d’offres absentes du catalogue, désactive la comparaison lorsque la sélection est incomplète ou mélange les devises, et actualise le tableau après changement de sélection ou de catalogue. Trois tests de régression supplémentaires passent. Aucune migration supplémentaire n’est nécessaire.

GitHub rapporte un statut Vercel réussi pour `9596e4d` (déploiement automatique existant). Le connecteur Vercel retourne encore 403 pour l’espace `botdeal`, et le navigateur refuse `http://localhost:3000` avec `ERR_BLOCKED_BY_CLIENT`. Le statut de build ne valide donc ni la confidentialité de la preview, ni les parcours réels avec emails, ni le rendu mobile.

## Admin : intégrité des offres — suite de `618e7fc`

L’édition préserve le vendeur existant lorsque son nom ne change pas, y compris son identifiant, son slug et sa vérification. Le lien de la fiche marchande et le lien affilié facultatif sont maintenant distincts ; effacer ce dernier rétablit bien la redirection vers le vendeur. Aucun réseau d’affiliation n’est connecté. Les dates de début/expiration UTC sont contrôlées côté interface et base, et les offres mises en avant sont prioritaires sur l’accueil. Les clients antérieurs peuvent continuer à appeler la même RPC sans effacer les nouveaux champs optionnels.

Le scénario SQL a reproduit le remplacement incorrect du vendeur avant migration, puis a passé après correction. Il couvre aussi les liens invalides, les dates inversées, les offres programmées, l’effacement du lien affilié et la compatibilité des anciennes requêtes. Les données de test ont été annulées. Les 26 tests JSDOM passent ; cela ne remplace pas une validation dans un navigateur réel.

Après la reconnexion Vercel annoncée par le propriétaire, le connecteur retourne toujours une équipe vide et 403 sur le projet. Ce blocage est traité comme un problème du connecteur, sans nouvelle demande de reconnexion. La protection contre les mots de passe compromis reste la seule alerte du contrôle sécurité Supabase, déjà documentée plus haut.

## Authentification et sauvegardes — suite de `3ff36ce`

Le chargement initial de session, l’édition du profil et les lectures admin ignorent leurs réponses si le compte a changé entre-temps. Une erreur de vérification admin retire l’affichage privilégié. Le compte dispose d’un bouton de nouvelle tentative après un échec de chargement ou de restauration des sélections. Le formulaire de récupération de mot de passe est testé pour succès et lien expiré, sans prétendre valider la réception d’un email.

La nouvelle interface utilise `save_personal_state_checked` : la base verrouille les sauvegardes du compte et compare les sélections à leur dernier état confirmé. Une modification concurrente provoque un refus atomique (40001), le rechargement des données et un message explicite. Les IDs et statuts d’alertes générés côté serveur ne provoquent pas de faux conflits. L’ancienne RPC reste disponible pour compatibilité ; les anciens clients ne bénéficient pas de ce contrôle. Aucun privilège RLS n’est contourné.

Vérification du 12 septembre 2026 : 31 tests JSDOM passent, les 7 contrôles REST passent (dont la nouvelle RPC refusée au visiteur avec HTTP 401), et le scénario SQL complet passe après la sixième migration, avec annulation des fixtures. Les cas SQL comprennent l’administration, les rôles, l’isolation, les favoris, les limites de comparaison, l’historique, les alertes, les URL, les dates, le tracking et le rejet d’une sauvegarde devenue obsolète. Les 14 tables publiques sont sous RLS. Le catalogue réel compte 0 offre et 0 marchand.

### Validation encore nécessaire avant production

- Une preview privée accessible pour les parcours de bout en bout sur navigateur desktop/mobile : inscriptions, connexion, déconnexion, récupération, admin et sélections. Les tests JSDOM ne vérifient pas le rendu réel.
- Configurer/vérifier les URLs Auth de cette preview et tester les emails de confirmation/récupération avec une adresse autorisée. Vérifier la délivrabilité et les limites de l’envoi Auth existant, sans achat automatique.
- Alimenter le catalogue avec des offres réelles vérifiées et définir leur mise à jour. `dealbot-sync` fonctionne mais n’importe toujours pas d’offres ; Admitad reste déconnecté.
- Résoudre ou accepter explicitement la protection contre les mots de passe compromis désactivée, déjà signalée par Supabase.

Limites de périmètre conservées : alertes visibles dans le compte, sans email/push ; contact enregistré dans l’admin, sans email ; anglais partiel ; limite de catalogue de 10 000 offres côté client. Ces capacités ne doivent pas être annoncées au-delà de ce qui est implémenté. Vercel n’a pas été sollicité de nouveau.

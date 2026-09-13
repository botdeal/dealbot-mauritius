# Autopilot — validation du 12 septembre 2026

Suite de `2a7bc9d`, exclusivement sur `supabase-integration`.

## Ce qui est livré

Le moteur reçoit un lot canonique via une fonction Edge authentifiée, l'enregistre dans une file privée, puis applique les offres dans une transaction. Il valide et normalise les champs, conserve des identités uniques par source, met à jour les marchands/catégories/offres et calcule un score automatique versionné. Les déclencheurs de prix existants conservent l'historique. Une erreur annule le lot entier et laisse une trace durable ; les erreurs transitoires sont reprises avec délai progressif et limite d'essais.

Une réconciliation complète expire uniquement les offres de cette source absentes d'un lot complet réussi. Un verrou transactionnel par source empêche les écritures concurrentes. Les lots plus anciens ne remplacent pas une révision déjà appliquée. Les offres archivées ou mises en pause manuellement ne sont pas republiées par l'import.

`dealbot-sync` v5 est déployé dans Supabase avec authentification `secret`, sans Admitad. Le moteur ne crée aucune source active de sa propre initiative. Le contrat, les adaptateurs canonique et fixture et les règles de score sont versionnés dans `supabase/functions/dealbot-sync/CONTRACT.md`.

## Preuves

**37 tests Node réussis** après les corrections finales, dont 31 tests d'interface, un test de pagination et cinq tests couvrant le moteur, son contrat et la reconstruction. Le scénario SQL réel a été rejoué après la correction de cohérence des scores ; il vérifie aussi qu'une correction admin du prix recalcule le score au lieu de conserver une valeur périmée.

- Scénario `tests/autopilot.sql` exécuté sur le projet Supabase existant : premier import, replay sans doublon/historique superflu, prix modifié et historique ajouté, modification d'offre/marchand/catégorie, offre disparue, erreur SQL temporaire 40001 sur une seconde offre, rollback de la première modification, journal d'erreur puis reprise réussie. Rejet d'un snapshot invalide, d'une clé réutilisée avec un autre contenu et d'un domaine affilié non autorisé. Expiration et publication contrôlées ; tracking public de l'offre importée vérifié. Tout est annulé par ROLLBACK.
- Même scénario sur une base PostgreSQL reconstruite depuis le schéma versionné ; scénario préexistant `tests/database.sql` (Auth/RLS/admin/favoris/alertes) également passé sur cette reconstruction.
- Trajet Request HTTP → handler réel → adaptateur → PostgreSQL local : lot accepté avant une erreur de transport simulée, traitement par le worker, redélivrance sans doublon. Le middleware d'authentification Edge n'est pas exécuté dans ce test local.
- Concurrence réelle : une connexion Cron détenait le verrou du compte source de fixture ; une autre connexion a appelé le moteur et reçu `{"id":11,"state":"busy"}`. Les tâches temporaires de verrouillage ont été retirées.
- Worker permanent `dealbot-autopilot-worker` actif, toutes les minutes ; plusieurs exécutions `succeeded` observées dans cron.job_run_details. Un lot de fixture vide explicitement autorisé a été consommé sans appel manuel à sync_process après activation de la source. Ce lot, sa source et ses événements ont ensuite été nettoyés.
- Après nettoyage : zéro offre, zéro marchand, zéro source d'import et zéro lot restant. Les comptes existants et catégories de référence sont conservés.
- API publique : 7 contrôles REST passés. Edge : sans clé ou avec clé publique, HTTP 401 après déploiement ; aucune clé serveur exposée ni extraite. Les trois fichiers du source v5 ont été récupérés du serveur et correspondent exactement aux fichiers locaux.
- Dépendances Node épinglées : audit npm sans vulnérabilité déclarée. Les tests utilisent PGlite 0.5.8 (PostgreSQL 18.3) ; les tests distants utilisent le PostgreSQL 17 du projet. Les deux environnements sont distingués.

## Reconstruction

`supabase/bootstrap/schema.sql` contient les 14 tables applicatives initiales, types, contraintes, index, fonctions, triggers, permissions et RLS issus de l'état réel pré-Autopilot, sans données privées. `seed.sql` ajoute uniquement la taxonomie et les emplacements publicitaires de référence.

`supabase/bootstrap/rebuild.sql` assemble ce snapshot et les migrations Autopilot pour un NOUVEAU projet Supabase. Il refuse d'agir si la table deals existe. Ne pas rejouer les anciennes migrations additives après ce snapshot : leur résultat y est déjà inclus. Sur le projet existant, les nouvelles migrations sont déjà appliquées ; ne pas rejouer bootstrap.

Cette reconstruction concerne le schéma applicatif : le projet Supabase fournit Auth, les rôles et les extensions. Les credentials, comptes utilisateurs, réglages SMTP/URLs Auth et secrets ne sont pas des seeds et ne sont jamais copiés dans Git. Le frontend d'un nouveau projet devra utiliser son URL et sa clé publique. Ce n'est pas une restauration des données du projet existant.

## Limites avant une source affiliée réelle

**READY FOR ADMITAD: NO** pour une mise en service réelle aujourd'hui.

Le moteur et son contrat sont opérationnels et testés avec des fixtures, mais :

1. L'adaptateur de collecte Admitad (API/feed, authentification, pagination, quotas, mapping) n'est pas implémenté ni connecté, conformément à la consigne. Son implémentation devra respecter le contrat canonique.
2. Un lot est borné à 500 offres/2 MiB. Une réconciliation complète exige un snapshot ENTIER : elle ne doit jamais être activée sur une seule page de flux. Au-delà, il faut une étape durable d'assemblage/validation du snapshot multi-page, ou des mises à jour incrémentales avec échéances explicites. Le moteur refuse les gros lots plutôt que tronquer silencieusement.
3. L'import authentifié à travers l'URL Edge publique n'a pas été exécuté avec une vraie clé serveur pendant cette session. Le chemin handler→base est validé localement, et le moteur/worker sont validés sur Supabase ; cette dernière vérification de transport authentifié reste distincte.
4. Aucune recette avec prix, identifiants et liens de la source réelle, ni test de volume représentatif n'a été effectué. La conservation des journaux n'a pas encore de purge automatique ; aucun historique n'est supprimé sans politique définie.

Cron fonctionne pour traiter la file et les échéances. Il ne collecte pas de flux externe à ce stade. Aucune dépense, connexion Admitad ou modification de main.

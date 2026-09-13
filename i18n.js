(function(root){
"use strict";
const messages={
  "Source": {"fr": "Source", "en": "Source"},
  "Saisie manuelle": {"fr": "Saisie manuelle", "en": "Manual entry"},
  "Identifiant source": {"fr": "Identifiant source", "en": "Source identifier"},
  "Révision": {"fr": "Révision", "en": "Revision"},
  "Lien affilié": {"fr": "Lien affilié", "en": "Affiliate link"},
  "Non renseigné": {"fr": "Non renseigné", "en": "Not provided"},
  "Calcul automatique v1": {"fr": "Calcul automatique v1", "en": "Automatic calculation v1"},
  "Score éditorial": {"fr": "Score éditorial", "en": "Editorial score"},

  "DealBot — Comparateur et suivi de bonnes affaires": {
    "fr": "DealBot — Comparateur et suivi de bonnes affaires",
    "en": "DealBot — Deal comparison and price tracking"
  },
  "Chargement des offres…": {
    "fr": "Chargement des offres…",
    "en": "Loading deals…"
  },
  "Réessayer": {
    "fr": "Réessayer",
    "en": "Retry"
  },
  "Réessayer le chargement du compte": {
    "fr": "Réessayer le chargement du compte",
    "en": "Retry loading your account"
  },
  "Deal": {
    "fr": "Deal",
    "en": "Deal"
  },
  "Bot": {
    "fr": "Bot",
    "en": "Bot"
  },
  "Explorer les offres": {
    "fr": "Explorer les offres",
    "en": "Explore deals"
  },
  "Catégories": {
    "fr": "Catégories",
    "en": "Categories"
  },
  "Comparer": {
    "fr": "Comparer",
    "en": "Compare"
  },
  "DealBot Intelligence": {
    "fr": "DealBot Intelligence",
    "en": "DealBot Intelligence"
  },
  "Favoris": {
    "fr": "Favoris",
    "en": "Favorites"
  },
  "Alertes de prix": {
    "fr": "Alertes de prix",
    "en": "Price alerts"
  },
  "FR": {
    "fr": "FR",
    "en": "FR"
  },
  "EN": {
    "fr": "EN",
    "en": "EN"
  },
  "Connexion": {
    "fr": "Connexion",
    "en": "Log in"
  },
  "Créer un compte": {
    "fr": "Créer un compte",
    "en": "Create an account"
  },
  "Mon compte": {
    "fr": "Mon compte",
    "en": "My account"
  },
  "Profil": {
    "fr": "Profil",
    "en": "Profile"
  },
  "Administration": {
    "fr": "Administration",
    "en": "Administration"
  },
  "Déconnexion": {
    "fr": "Déconnexion",
    "en": "Log out"
  },
  "Comment ça marche": {
    "fr": "Comment ça marche",
    "en": "How it works"
  },
  "Comparaison · Suivi · Analyse": {
    "fr": "Comparaison · Suivi · Analyse",
    "en": "Compare · Track · Analyze"
  },
  "Trouvez de meilleures offres avant d'acheter.": {
    "fr": "Trouvez de meilleures offres avant d'acheter.",
    "en": "Find better deals before you buy."
  },
  "DealBot rassemble, compare et suit les prix pour vous aider à évaluer une offre avant de l'acheter — sans battage, avec des données claires.": {
    "fr": "DealBot rassemble, compare et suit les prix pour vous aider à évaluer une offre avant de l'acheter — sans battage, avec des données claires.",
    "en": "DealBot brings together, compares and tracks prices to help you assess a deal before buying — clear data, without the hype."
  },
  "OFFRES SUIVIES": {
    "fr": "OFFRES SUIVIES",
    "en": "TRACKED DEALS"
  },
  "CATÉGORIES": {
    "fr": "CATÉGORIES",
    "en": "CATEGORIES"
  },
  "VENDEURS RÉFÉRENCÉS": {
    "fr": "VENDEURS RÉFÉRENCÉS",
    "en": "LISTED SELLERS"
  },
  "Que recherchez-vous ?": {
    "fr": "Que recherchez-vous ?",
    "en": "What are you looking for?"
  },
  "Rechercher": {
    "fr": "Rechercher",
    "en": "Search"
  },
  "iPhone": {
    "fr": "iPhone",
    "en": "iPhone"
  },
  "Laptop": {
    "fr": "Ordinateur portable",
    "en": "Laptop"
  },
  "Sneakers": {
    "fr": "Baskets",
    "en": "Sneakers"
  },
  "Headphones": {
    "fr": "Casque audio",
    "en": "Headphones"
  },
  "Hotel": {
    "fr": "Hôtel",
    "en": "Hotel"
  },
  "Software": {
    "fr": "Logiciels",
    "en": "Software"
  },
  "Espace partenaire": {
    "fr": "Espace partenaire",
    "en": "Partner space"
  },
  "Sélection": {
    "fr": "Sélection",
    "en": "Selection"
  },
  "Sélection du moment": {
    "fr": "Sélection du moment",
    "en": "Featured deals"
  },
  "Voir toutes les offres": {
    "fr": "Voir toutes les offres",
    "en": "View all deals"
  },
  "Aucune sélection disponible actuellement": {
    "fr": "Aucune sélection disponible actuellement",
    "en": "No featured deals available right now"
  },
  "Les nouvelles offres apparaîtront ici après leur analyse par DealBot.": {
    "fr": "Les nouvelles offres apparaîtront ici après leur analyse par DealBot.",
    "en": "New deals will appear here after DealBot has analyzed them."
  },
  "Navigation": {
    "fr": "Navigation",
    "en": "Navigation"
  },
  "Parcourir par catégorie": {
    "fr": "Parcourir par catégorie",
    "en": "Browse by category"
  },
  "Toutes les catégories": {
    "fr": "Toutes les catégories",
    "en": "All categories"
  },
  "Méthode": {
    "fr": "Méthode",
    "en": "Method"
  },
  "Comment fonctionne DealBot": {
    "fr": "Comment fonctionne DealBot",
    "en": "How DealBot works"
  },
  "Découvrir": {
    "fr": "Découvrir",
    "en": "Discover"
  },
  "Retrouvez des offres provenant de différentes boutiques et plateformes.": {
    "fr": "Retrouvez des offres provenant de différentes boutiques et plateformes.",
    "en": "Find deals from different stores and platforms."
  },
  "Comparez les prix, réductions, vendeurs et données disponibles.": {
    "fr": "Comparez les prix, réductions, vendeurs et données disponibles.",
    "en": "Compare prices, discounts, sellers and available data."
  },
  "Suivre": {
    "fr": "Suivre",
    "en": "Track"
  },
  "Enregistrez vos offres et définissez le prix que vous souhaitez surveiller.": {
    "fr": "Enregistrez vos offres et définissez le prix que vous souhaitez surveiller.",
    "en": "Save deals and set the price you want to track."
  },
  "Acheter": {
    "fr": "Acheter",
    "en": "Buy"
  },
  "Lorsque vous êtes prêt, accédez directement au vendeur pour finaliser l'achat.": {
    "fr": "Lorsque vous êtes prêt, accédez directement au vendeur pour finaliser l'achat.",
    "en": "When you are ready, go directly to the seller to complete your purchase."
  },
  "Catalogue": {
    "fr": "Catalogue",
    "en": "Catalog"
  },
  "Recherchez et filtrez les offres selon leur prix, leur catégorie, leur vendeur et leur DealBot Score.": {
    "fr": "Recherchez et filtrez les offres selon leur prix, leur catégorie, leur vendeur et leur DealBot Score.",
    "en": "Search and filter deals by price, category, seller and DealBot Score."
  },
  "Filtres": {
    "fr": "Filtres",
    "en": "Filters"
  },
  "Devise des prix": {
    "fr": "Devise des prix",
    "en": "Price currency"
  },
  "MUR": {
    "fr": "MUR",
    "en": "MUR"
  },
  "EUR": {
    "fr": "EUR",
    "en": "EUR"
  },
  "USD": {
    "fr": "USD",
    "en": "USD"
  },
  "GBP": {
    "fr": "GBP",
    "en": "GBP"
  },
  "Recherche": {
    "fr": "Recherche",
    "en": "Search"
  },
  "Catégorie": {
    "fr": "Catégorie",
    "en": "Category"
  },
  "Prix": {
    "fr": "Prix",
    "en": "Price"
  },
  "Réduction minimum": {
    "fr": "Réduction minimum",
    "en": "Minimum discount"
  },
  "Toutes": {
    "fr": "Toutes",
    "en": "All"
  },
  "10 % et plus": {
    "fr": "10 % et plus",
    "en": "10% or more"
  },
  "20 % et plus": {
    "fr": "20 % et plus",
    "en": "20% or more"
  },
  "30 % et plus": {
    "fr": "30 % et plus",
    "en": "30% or more"
  },
  "40 % et plus": {
    "fr": "40 % et plus",
    "en": "40% or more"
  },
  "50 % et plus": {
    "fr": "50 % et plus",
    "en": "50% or more"
  },
  "Vendeur": {
    "fr": "Vendeur",
    "en": "Seller"
  },
  "Tous les vendeurs": {
    "fr": "Tous les vendeurs",
    "en": "All sellers"
  },
  "DealBot Score minimum": {
    "fr": "DealBot Score minimum",
    "en": "Minimum DealBot Score"
  },
  "Tous": {
    "fr": "Tous",
    "en": "All"
  },
  "Réinitialiser": {
    "fr": "Réinitialiser",
    "en": "Reset"
  },
  "0 offre": {
    "fr": "0 offre",
    "en": "0 deals"
  },
  "Meilleur DealBot Score": {
    "fr": "Meilleur DealBot Score",
    "en": "Highest DealBot Score"
  },
  "Plus forte réduction": {
    "fr": "Plus forte réduction",
    "en": "Largest discount"
  },
  "Prix croissant": {
    "fr": "Prix croissant",
    "en": "Price: low to high"
  },
  "Prix décroissant": {
    "fr": "Prix décroissant",
    "en": "Price: high to low"
  },
  "Plus récent": {
    "fr": "Plus récent",
    "en": "Newest"
  },
  "Aucune offre trouvée": {
    "fr": "Aucune offre trouvée",
    "en": "No deals found"
  },
  "Aucune offre ne correspond actuellement aux critères sélectionnés.": {
    "fr": "Aucune offre ne correspond actuellement aux critères sélectionnés.",
    "en": "No deals currently match the selected filters."
  },
  "Réinitialiser les filtres": {
    "fr": "Réinitialiser les filtres",
    "en": "Reset filters"
  },
  "Impossible de charger les offres": {
    "fr": "Impossible de charger les offres",
    "en": "Unable to load deals"
  },
  "Une erreur est survenue pendant le chargement des données.": {
    "fr": "Une erreur est survenue pendant le chargement des données.",
    "en": "An error occurred while loading the data."
  },
  "Voir plus d'offres": {
    "fr": "Voir plus d'offres",
    "en": "Load more deals"
  },
  "Parcourez les offres DealBot par univers.": {
    "fr": "Parcourez les offres DealBot par univers.",
    "en": "Browse DealBot deals by category."
  },
  "← Retour aux offres": {
    "fr": "← Retour aux offres",
    "en": "← Back to deals"
  },
  "Comparateur": {
    "fr": "Comparateur",
    "en": "Comparison"
  },
  "Comparer les offres": {
    "fr": "Comparer les offres",
    "en": "Compare deals"
  },
  "Sélectionnez jusqu'à quatre offres pour comparer leurs principales caractéristiques.": {
    "fr": "Sélectionnez jusqu'à quatre offres pour comparer leurs principales caractéristiques.",
    "en": "Select up to four deals to compare their main features."
  },
  "Aucune offre disponible": {
    "fr": "Aucune offre disponible",
    "en": "No deals available"
  },
  "Les produits disponibles pour comparaison apparaîtront ici.": {
    "fr": "Les produits disponibles pour comparaison apparaîtront ici.",
    "en": "Products available for comparison will appear here."
  },
  "0 / 4 sélectionnée": {
    "fr": "0 / 4 sélectionnée",
    "en": "0 / 4 selected"
  },
  "Effacer": {
    "fr": "Effacer",
    "en": "Clear"
  },
  "Voir le comparatif": {
    "fr": "Voir le comparatif",
    "en": "View comparison"
  },
  "Analyse": {
    "fr": "Analyse",
    "en": "Analysis"
  },
  "Une lecture structurée des données disponibles pour faciliter l'évaluation d'une offre.": {
    "fr": "Une lecture structurée des données disponibles pour faciliter l'évaluation d'une offre.",
    "en": "A structured view of the available data to help you assess a deal."
  },
  "Le DealBot Score peut être éditorial ou calculé automatiquement. La méthode est indiquée pour chaque offre, sans prédiction de prix. Il ne constitue ni une garantie de prix, ni une recommandation financière, ni une garantie sur le vendeur ou le produit.": {
    "fr": "Le DealBot Score peut être éditorial ou calculé automatiquement. La méthode est indiquée pour chaque offre, sans prédiction de prix. Il ne constitue ni une garantie de prix, ni une recommandation financière, ni une garantie sur le vendeur ou le produit.",
    "en": "The DealBot Score may be editorial or calculated automatically. Each deal states its method, without price predictions. It does not guarantee prices, sellers or products and is not financial advice."
  },
  "Pas encore assez de données": {
    "fr": "Pas encore assez de données",
    "en": "Not enough data yet"
  },
  "Les analyses apparaîtront lorsque DealBot disposera de suffisamment d'informations sur les offres suivies.": {
    "fr": "Les analyses apparaîtront lorsque DealBot disposera de suffisamment d'informations sur les offres suivies.",
    "en": "Analysis will appear when DealBot has enough information about tracked deals."
  },
  "Personnel": {
    "fr": "Personnel",
    "en": "Personal"
  },
  "Offres enregistrées": {
    "fr": "Offres enregistrées",
    "en": "Saved deals"
  },
  "Retrouvez ici les offres que vous avez sauvegardées.": {
    "fr": "Retrouvez ici les offres que vous avez sauvegardées.",
    "en": "Find the deals you have saved here."
  },
  "Aucun favori pour le moment": {
    "fr": "Aucun favori pour le moment",
    "en": "No favorites yet"
  },
  "Enregistrez une offre pour la retrouver rapidement ici.": {
    "fr": "Enregistrez une offre pour la retrouver rapidement ici.",
    "en": "Save a deal to find it quickly here."
  },
  "Surveillance": {
    "fr": "Surveillance",
    "en": "Tracking"
  },
  "Définissez un prix cible pour les produits que vous souhaitez suivre.": {
    "fr": "Définissez un prix cible pour les produits que vous souhaitez suivre.",
    "en": "Set a target price for the products you want to track."
  },
  "Produit": {
    "fr": "Produit",
    "en": "Product"
  },
  "Sélectionner un produit": {
    "fr": "Sélectionner un produit",
    "en": "Select a product"
  },
  "Prix cible": {
    "fr": "Prix cible",
    "en": "Target price"
  },
  "Créer l'alerte": {
    "fr": "Créer l'alerte",
    "en": "Create alert"
  },
  "Aucune alerte active": {
    "fr": "Aucune alerte active",
    "en": "No active alerts"
  },
  "Créez votre première alerte pour commencer à suivre un prix.": {
    "fr": "Créez votre première alerte pour commencer à suivre un prix.",
    "en": "Create your first alert to start tracking a price."
  },
  "Compte": {
    "fr": "Compte",
    "en": "Account"
  },
  "Mon profil": {
    "fr": "Mon profil",
    "en": "My profile"
  },
  "Nom :": {
    "fr": "Nom :",
    "en": "Name:"
  },
  "Email :": {
    "fr": "Email :",
    "en": "Email:"
  },
  "Favoris :": {
    "fr": "Favoris :",
    "en": "Favorites:"
  },
  "Alertes actives :": {
    "fr": "Alertes actives :",
    "en": "Active alerts:"
  },
  "Nom": {
    "fr": "Nom",
    "en": "Name"
  },
  "Enregistrer le profil": {
    "fr": "Enregistrer le profil",
    "en": "Save profile"
  },
  "DealBot": {
    "fr": "DealBot",
    "en": "DealBot"
  },
  "DealBot organise les informations utiles pour rendre la recherche et la comparaison d'offres plus simples.": {
    "fr": "DealBot organise les informations utiles pour rendre la recherche et la comparaison d'offres plus simples.",
    "en": "DealBot organizes useful information to make finding and comparing deals easier."
  },
  "Collecte": {
    "fr": "Collecte",
    "en": "Collection"
  },
  "Les offres disponibles sont intégrées dans le catalogue DealBot.": {
    "fr": "Les offres disponibles sont intégrées dans le catalogue DealBot.",
    "en": "Available deals are added to the DealBot catalog."
  },
  "DealBot structure les données de prix, réduction et historique disponibles.": {
    "fr": "DealBot structure les données de prix, réduction et historique disponibles.",
    "en": "DealBot organizes the available price, discount and history data."
  },
  "Comparaison": {
    "fr": "Comparaison",
    "en": "Comparison"
  },
  "Vous pouvez comparer plusieurs offres selon les critères disponibles.": {
    "fr": "Vous pouvez comparer plusieurs offres selon les critères disponibles.",
    "en": "You can compare several deals using the available criteria."
  },
  "Redirection": {
    "fr": "Redirection",
    "en": "Seller link"
  },
  "L'achat final est effectué directement auprès du vendeur concerné.": {
    "fr": "L'achat final est effectué directement auprès du vendeur concerné.",
    "en": "The final purchase takes place directly with the relevant seller."
  },
  "À propos": {
    "fr": "À propos",
    "en": "About"
  },
  "DealBot est une plateforme de découverte, comparaison et suivi d'offres en ligne.": {
    "fr": "DealBot est une plateforme de découverte, comparaison et suivi d'offres en ligne.",
    "en": "DealBot is a platform for discovering, comparing and tracking online deals."
  },
  "Notre objectif est de présenter les informations essentielles de manière claire afin d'aider les utilisateurs à mieux évaluer les offres disponibles avant de visiter le site du vendeur.": {
    "fr": "Notre objectif est de présenter les informations essentielles de manière claire afin d'aider les utilisateurs à mieux évaluer les offres disponibles avant de visiter le site du vendeur.",
    "en": "Our aim is to present essential information clearly so that users can assess available deals before visiting the seller's website."
  },
  "DealBot n'est pas le vendeur des produits référencés. Les transactions sont réalisées directement sur les plateformes partenaires ou marchandes concernées.": {
    "fr": "DealBot n'est pas le vendeur des produits référencés. Les transactions sont réalisées directement sur les plateformes partenaires ou marchandes concernées.",
    "en": "DealBot does not sell the listed products. Transactions take place directly on the relevant partner or merchant platforms."
  },
  "Support": {
    "fr": "Support",
    "en": "Support"
  },
  "Contact": {
    "fr": "Contact",
    "en": "Contact"
  },
  "Une question, un problème ou une demande concernant DealBot ?": {
    "fr": "Une question, un problème ou une demande concernant DealBot ?",
    "en": "A question, problem or request about DealBot?"
  },
  "Email": {
    "fr": "Email",
    "en": "Email"
  },
  "Message": {
    "fr": "Message",
    "en": "Message"
  },
  "Envoyer": {
    "fr": "Envoyer",
    "en": "Send"
  },
  "Informations": {
    "fr": "Informations",
    "en": "Information"
  },
  "Politique de confidentialité": {
    "fr": "Politique de confidentialité",
    "en": "Privacy policy"
  },
  "DealBot limite la collecte de données aux informations nécessaires au fonctionnement des services proposés.": {
    "fr": "DealBot limite la collecte de données aux informations nécessaires au fonctionnement des services proposés.",
    "en": "DealBot limits data collection to the information needed to operate its services."
  },
  "Vos favoris, comparaisons, alertes et messages sont enregistrés dans votre compte. La session de connexion et la langue sont conservées sur votre appareil.": {
    "fr": "Vos favoris, comparaisons, alertes et messages sont enregistrés dans votre compte. La session de connexion et la langue sont conservées sur votre appareil.",
    "en": "Your favorites, comparisons, alerts and messages are stored in your account. Your login session and language preference are stored on your device."
  },
  "Lors d’une redirection marchand, DealBot enregistre l’offre, la page de départ, la date et un identifiant de session. Les alertes sont consultables dans le compte ; aucun email d’alerte n’est envoyé actuellement. Utilisez le formulaire de contact pour demander l’accès ou la suppression de vos données.": {
    "fr": "Lors d’une redirection marchand, DealBot enregistre l’offre, la page de départ, la date et un identifiant de session. Les alertes sont consultables dans le compte ; aucun email d’alerte n’est envoyé actuellement. Utilisez le formulaire de contact pour demander l’accès ou la suppression de vos données.",
    "en": "When you follow a seller link, DealBot records the deal, originating page, date and a session identifier. Alerts are available in your account; alert emails are not currently sent. Use the contact form to request access to or deletion of your data."
  },
  "Conditions d'utilisation": {
    "fr": "Conditions d'utilisation",
    "en": "Terms of use"
  },
  "DealBot fournit des informations de comparaison et de suivi à titre informatif.": {
    "fr": "DealBot fournit des informations de comparaison et de suivi à titre informatif.",
    "en": "DealBot provides comparison and tracking information for informational purposes."
  },
  "Les prix, disponibilités, réductions et conditions commerciales peuvent évoluer. Les informations affichées sur le site du vendeur au moment de l'achat restent la référence.": {
    "fr": "Les prix, disponibilités, réductions et conditions commerciales peuvent évoluer. Les informations affichées sur le site du vendeur au moment de l'achat restent la référence.",
    "en": "Prices, availability, discounts and commercial terms may change. The information displayed on the seller's website at the time of purchase remains authoritative."
  },
  "DealBot peut percevoir une commission lorsque certaines redirections vers des partenaires aboutissent à une transaction, sans nécessairement modifier le prix payé par l'utilisateur.": {
    "fr": "DealBot peut percevoir une commission lorsque certaines redirections vers des partenaires aboutissent à une transaction, sans nécessairement modifier le prix payé par l'utilisateur.",
    "en": "DealBot may earn a commission when certain partner referrals lead to a transaction, without necessarily changing the price you pay."
  },
  "DealBot interne": {
    "fr": "DealBot interne",
    "en": "DealBot internal"
  },
  "Gestion des offres, des messages et des publicités.": {
    "fr": "Gestion des offres, des messages et des publicités.",
    "en": "Manage deals, messages and advertising."
  },
  "Accès réservé aux administrateurs. Les offres archivées conservent leur historique.": {
    "fr": "Accès réservé aux administrateurs. Les offres archivées conservent leur historique.",
    "en": "Administrators only. Archived deals retain their history."
  },
  "Offres": {
    "fr": "Offres",
    "en": "Deals"
  },
  "Mes favoris": {
    "fr": "Mes favoris",
    "en": "My favorites"
  },
  "Mes alertes": {
    "fr": "Mes alertes",
    "en": "My alerts"
  },
  "Ajouter, modifier ou masquer les offres de test.": {
    "fr": "Ajouter, modifier ou archiver les offres du catalogue.",
    "en": "Add, edit or archive catalog deals."
  },
  "Ajouter une offre": {
    "fr": "Ajouter une offre",
    "en": "Add a deal"
  },
  "Réduction": {
    "fr": "Réduction",
    "en": "Discount"
  },
  "Score": {
    "fr": "Score",
    "en": "Score"
  },
  "Statut": {
    "fr": "Statut",
    "en": "Status"
  },
  "Actions": {
    "fr": "Actions",
    "en": "Actions"
  },
  "Découvrez, comparez et suivez les offres avant d'acheter.": {
    "fr": "Découvrez, comparez et suivez les offres avant d'acheter.",
    "en": "Discover, compare and track deals before you buy."
  },
  "Explorer": {
    "fr": "Explorer",
    "en": "Explore"
  },
  "Confidentialité": {
    "fr": "Confidentialité",
    "en": "Privacy"
  },
  "Conditions": {
    "fr": "Conditions",
    "en": "Terms"
  },
  "DealBot. Tous droits réservés.": {
    "fr": "DealBot. Tous droits réservés.",
    "en": "DealBot. All rights reserved."
  },
  "×": {
    "fr": "×",
    "en": "×"
  },
  "Adresse email": {
    "fr": "Adresse email",
    "en": "Email address"
  },
  "Mot de passe": {
    "fr": "Mot de passe",
    "en": "Password"
  },
  "Se connecter": {
    "fr": "Se connecter",
    "en": "Log in"
  },
  "Mot de passe oublié ?": {
    "fr": "Mot de passe oublié ?",
    "en": "Forgot your password?"
  },
  "Pas encore de compte ?": {
    "fr": "Pas encore de compte ?",
    "en": "Don't have an account?"
  },
  "Créer mon compte": {
    "fr": "Créer mon compte",
    "en": "Create my account"
  },
  "La gestion sécurisée des comptes sera reliée au système d'authentification du backend.": {
    "fr": "Votre compte est sécurisé. Confirmez votre adresse email pour activer votre compte.",
    "en": "Your account is secured. Confirm your email address to activate your account."
  },
  "Vous avez déjà un compte ?": {
    "fr": "Vous avez déjà un compte ?",
    "en": "Already have an account?"
  },
  "Offre DealBot": {
    "fr": "Offre DealBot",
    "en": "DealBot deal"
  },
  "Nom du produit": {
    "fr": "Nom du produit",
    "en": "Product name"
  },
  "Prix actuel": {
    "fr": "Prix actuel",
    "en": "Current price"
  },
  "Prix de référence": {
    "fr": "Prix de référence",
    "en": "Reference price"
  },
  "DealBot Score": {
    "fr": "DealBot Score",
    "en": "DealBot Score"
  },
  "Disponibilité": {
    "fr": "Disponibilité",
    "en": "Availability"
  },
  "Stock non confirmé": {
    "fr": "Stock non confirmé",
    "en": "Stock unconfirmed"
  },
  "Disponible": {
    "fr": "Disponible",
    "en": "Available"
  },
  "Stock limité": {
    "fr": "Stock limité",
    "en": "Limited stock"
  },
  "Épuisé": {
    "fr": "Épuisé",
    "en": "Out of stock"
  },
  "Lien de la fiche chez le vendeur": {
    "fr": "Lien de la fiche chez le vendeur",
    "en": "Product page on the seller's website"
  },
  "État": {
    "fr": "État",
    "en": "State"
  },
  "Brouillon": {
    "fr": "Brouillon",
    "en": "Draft"
  },
  "Publié": {
    "fr": "Publié",
    "en": "Published"
  },
  "En pause": {
    "fr": "En pause",
    "en": "Paused"
  },
  "Expiré": {
    "fr": "Expiré",
    "en": "Expired"
  },
  "Archivé": {
    "fr": "Archivé",
    "en": "Archived"
  },
  "Devise": {
    "fr": "Devise",
    "en": "Currency"
  },
  "Lien affilié HTTPS (facultatif)": {
    "fr": "Lien affilié HTTPS (facultatif)",
    "en": "HTTPS affiliate link (optional)"
  },
  "Image HTTPS": {
    "fr": "Image HTTPS",
    "en": "HTTPS image"
  },
  "Début de publication (UTC)": {
    "fr": "Début de publication (UTC)",
    "en": "Publication starts (UTC)"
  },
  "Mettre en avant sur l’accueil": {
    "fr": "Mettre en avant sur l’accueil",
    "en": "Feature on the home page"
  },
  "Expiration (UTC)": {
    "fr": "Expiration (UTC)",
    "en": "Expires (UTC)"
  },
  "Description": {
    "fr": "Description",
    "en": "Description"
  },
  "Annuler": {
    "fr": "Annuler",
    "en": "Cancel"
  },
  "Enregistrer": {
    "fr": "Enregistrer",
    "en": "Save"
  },
  "Nouveau mot de passe": {
    "fr": "Nouveau mot de passe",
    "en": "New password"
  },
  "Mot de passe (12 caractères minimum)": {
    "fr": "Mot de passe (12 caractères minimum)",
    "en": "Password (at least 12 characters)"
  },
  "DealBot accueil": {
    "fr": "DealBot accueil",
    "en": "DealBot home"
  },
  "Navigation principale": {
    "fr": "Navigation principale",
    "en": "Main navigation"
  },
  "Choisir la langue": {
    "fr": "Choisir la langue",
    "en": "Choose language"
  },
  "Français": {
    "fr": "Français",
    "en": "Français"
  },
  "English": {
    "fr": "English",
    "en": "English"
  },
  "Ouvrir le menu": {
    "fr": "Ouvrir le menu",
    "en": "Open menu"
  },
  "Navigation mobile": {
    "fr": "Navigation mobile",
    "en": "Mobile navigation"
  },
  "Produit, marque ou catégorie...": {
    "fr": "Produit, marque ou catégorie...",
    "en": "Product, brand or category..."
  },
  "Espace publicitaire": {
    "fr": "Espace publicitaire",
    "en": "Advertising space"
  },
  "Rechercher...": {
    "fr": "Rechercher...",
    "en": "Search..."
  },
  "Min.": {
    "fr": "Min.",
    "en": "Min."
  },
  "Max.": {
    "fr": "Max.",
    "en": "Max."
  },
  "Trier les offres": {
    "fr": "Trier les offres",
    "en": "Sort deals"
  },
  "Ex. 499": {
    "fr": "Ex. 499",
    "en": "E.g. 499"
  },
  "Fermer": {
    "fr": "Fermer",
    "en": "Close"
  },
  "https://...": {
    "fr": "https://...",
    "en": "https://..."
  },
  "Le site n’a pas pu se charger. Rechargez la page.": {
    "fr": "Le site n’a pas pu se charger. Rechargez la page.",
    "en": "The site could not load. Reload the page."
  },
  "Connexion aux données impossible. Réessayez.": {
    "fr": "Connexion aux données impossible. Réessayez.",
    "en": "Unable to load your data. Try again."
  },
  "Session indisponible. Réessayez.": {
    "fr": "Session indisponible. Réessayez.",
    "en": "Session unavailable. Try again."
  },
  "Beauté": {
    "fr": "Beauté",
    "en": "Beauty"
  },
  "Le catalogue est indisponible. Réessayez dans un instant.": {
    "fr": "Le catalogue est indisponible. Réessayez dans un instant.",
    "en": "The catalog is unavailable. Try again shortly."
  },
  "Aucune offre publiée pour le moment.": {
    "fr": "Aucune offre publiée pour le moment.",
    "en": "No deals have been published yet."
  },
  "Connectez-vous pour enregistrer votre sélection.": {
    "fr": "Connectez-vous pour enregistrer votre sélection.",
    "en": "Log in to save your selection."
  },
  "Chargement du compte en cours.": {
    "fr": "Chargement du compte en cours.",
    "en": "Your account is loading."
  },
  "Enregistré dans votre compte": {
    "fr": "Enregistré dans votre compte",
    "en": "Saved to your account"
  },
  "Échec de sauvegarde. Rechargez vos données avant de réessayer.": {
    "fr": "Échec de sauvegarde. Rechargez vos données avant de réessayer.",
    "en": "Save failed. Reload your data before trying again."
  },
  "Votre sélection a changé sur un autre appareil. La modification n’a pas été enregistrée.": {
    "fr": "Votre sélection a changé sur un autre appareil. La modification n’a pas été enregistrée.",
    "en": "Your selection changed on another device. Your change was not saved."
  },
  "La modification n’a pas été enregistrée.": {
    "fr": "La modification n’a pas été enregistrée.",
    "en": "Your change was not saved."
  },
  "Enregistrer cette offre": {
    "fr": "Enregistrer cette offre",
    "en": "Save this deal"
  },
  "Offre introuvable": {
    "fr": "Offre introuvable",
    "en": "Deal not found"
  },
  "Cette offre n'est plus disponible.": {
    "fr": "Cette offre n'est plus disponible.",
    "en": "This deal is no longer available."
  },
  "Chargement de l’historique…": {
    "fr": "Chargement de l’historique…",
    "en": "Loading price history…"
  },
  "Historique des prix": {
    "fr": "Historique des prix",
    "en": "Price history"
  },
  "Aucun historique disponible.": {
    "fr": "Aucun historique disponible.",
    "en": "No price history available."
  },
  "Historique indisponible. Réessayez plus tard.": {
    "fr": "Historique indisponible. Réessayez plus tard.",
    "en": "Price history is unavailable. Try again later."
  },
  "Lien marchand indisponible.": {
    "fr": "Lien marchand indisponible.",
    "en": "Seller link unavailable."
  },
  "Impossible d’ouvrir le marchand. Réessayez.": {
    "fr": "Impossible d’ouvrir le marchand. Réessayez.",
    "en": "Unable to open the seller. Try again."
  },
  "Comparez des offres dans la même devise.": {
    "fr": "Comparez des offres dans la même devise.",
    "en": "Compare deals in the same currency."
  },
  "Veuillez sélectionner au moins deux offres.": {
    "fr": "Veuillez sélectionner au moins deux offres.",
    "en": "Please select at least two deals."
  },
  "Critère": {
    "fr": "Critère",
    "en": "Criteria"
  },
  "Vérifiez les informations saisies (12 caractères minimum à l’inscription).": {
    "fr": "Vérifiez les informations saisies (12 caractères minimum à l’inscription).",
    "en": "Check your details (at least 12 characters for a new password)."
  },
  "Connexion réussie.": {
    "fr": "Connexion réussie.",
    "en": "Logged in successfully."
  },
  "Vérifiez votre messagerie pour confirmer votre compte.": {
    "fr": "Vérifiez votre messagerie pour confirmer votre compte.",
    "en": "Check your email to confirm your account."
  },
  "Connexion impossible. Vérifiez vos identifiants ou réessayez.": {
    "fr": "Connexion impossible. Vérifiez vos identifiants ou réessayez.",
    "en": "Unable to log in. Check your credentials or try again."
  },
  "Inscription impossible :": {
    "fr": "Inscription impossible :",
    "en": "Unable to sign up:"
  },
  "Message reçu. Il est disponible pour l’administrateur.": {
    "fr": "Message reçu. Il est disponible pour l’administrateur.",
    "en": "Message received. It is available to the administrator."
  },
  "Message non envoyé :": {
    "fr": "Message non envoyé :",
    "en": "Message not sent:"
  },
  "Indiquez votre adresse email.": {
    "fr": "Indiquez votre adresse email.",
    "en": "Enter your email address."
  },
  "Si un compte existe, un lien de réinitialisation sera envoyé.": {
    "fr": "Si un compte existe, un lien de réinitialisation sera envoyé.",
    "en": "If an account exists, a reset link will be sent."
  },
  "Demande impossible. Réessayez plus tard.": {
    "fr": "Demande impossible. Réessayez plus tard.",
    "en": "Request failed. Try again later."
  },
  "Mot de passe modifié.": {
    "fr": "Mot de passe modifié.",
    "en": "Password updated."
  },
  "Lien expiré ou modification impossible. Demandez un nouveau lien.": {
    "fr": "Lien expiré ou modification impossible. Demandez un nouveau lien.",
    "en": "The link has expired or the update failed. Request a new link."
  },
  "Profil enregistré.": {
    "fr": "Profil enregistré.",
    "en": "Profile saved."
  },
  "Profil non enregistré.": {
    "fr": "Profil non enregistré.",
    "en": "Profile not saved."
  },
  "Messages reçus": {
    "fr": "Messages reçus",
    "en": "Received messages"
  },
  "Aucun message.": {
    "fr": "Aucun message.",
    "en": "No messages."
  },
  "Messages indisponibles.": {
    "fr": "Messages indisponibles.",
    "en": "Messages unavailable."
  },
  "Espace partenaire disponible": {
    "fr": "Espace partenaire disponible",
    "en": "Partner space available"
  },
  "Publicité ·": {
    "fr": "Publicité ·",
    "en": "Advertisement ·"
  },
  "Modifier l'offre": {
    "fr": "Modifier l'offre",
    "en": "Edit deal"
  },
  "Archiver cette offre ? Son historique sera conservé.": {
    "fr": "Archiver cette offre ? Son historique sera conservé.",
    "en": "Archive this deal? Its history will be retained."
  },
  "Offre archivée.": {
    "fr": "Offre archivée.",
    "en": "Deal archived."
  },
  "Échec de l’archivage. Réessayez.": {
    "fr": "Échec de l’archivage. Réessayez.",
    "en": "Archive failed. Try again."
  },
  "Utilisez une URL HTTPS valide.": {
    "fr": "Utilisez une URL HTTPS valide.",
    "en": "Use a valid HTTPS URL."
  },
  "L’expiration doit être après le début de publication.": {
    "fr": "L’expiration doit être après le début de publication.",
    "en": "Expiry must be after the publication start."
  },
  "Offre enregistrée dans Supabase.": {
    "fr": "Offre enregistrée dans Supabase.",
    "en": "Deal saved."
  },
  "Enregistrement impossible :": {
    "fr": "Enregistrement impossible :",
    "en": "Unable to save:"
  },
  "Veuillez remplir ce champ.": {
    "fr": "Veuillez remplir ce champ.",
    "en": "Please fill out this field."
  },
  "Veuillez saisir une adresse email valide.": {
    "fr": "Veuillez saisir une adresse email valide.",
    "en": "Please enter a valid email address."
  },
  "Veuillez vérifier la valeur saisie.": {
    "fr": "Veuillez vérifier la valeur saisie.",
    "en": "Please check the entered value."
  },
  "Veuillez respecter la longueur demandée.": {
    "fr": "Veuillez respecter la longueur demandée.",
    "en": "Please use the required length."
  },
  "Gérez les offres du catalogue.": {
    "fr": "Gérez les offres du catalogue.",
    "en": "Manage catalog deals."
  },
  "Votre compte est sécurisé par Supabase Auth. Confirmez votre adresse email pour activer votre compte.": {
    "fr": "Votre compte est sécurisé par Supabase Auth. Confirmez votre adresse email pour activer votre compte.",
    "en": "Your account is secured by Supabase Auth. Confirm your email address to activate your account."
  },
  "Très intéressant": {
    "fr": "Très intéressant",
    "en": "Strong"
  },
  "Intéressant": {
    "fr": "Intéressant",
    "en": "Good"
  },
  "À vérifier": {
    "fr": "À vérifier",
    "en": "Average"
  },
  "Voir l’historique": {
    "fr": "Voir l’historique",
    "en": "See price history"
  },
  "Enregistré": {
    "fr": "Enregistré",
    "en": "Saved"
  },
  "Indication récente :": {
    "fr": "Indication récente :",
    "en": "Recent indication:"
  },
  "Détails": {
    "fr": "Détails",
    "en": "Details"
  },
  "Alerte prix": {
    "fr": "Alerte prix",
    "en": "Price alert"
  },
  "Mise à jour des favoris…": {
    "fr": "Mise à jour des favoris…",
    "en": "Saving favorites…"
  },
  "Offre retirée des favoris.": {
    "fr": "Offre retirée des favoris.",
    "en": "Deal removed from favorites."
  },
  "Cette offre est indisponible dans le catalogue actuel.": {
    "fr": "Cette offre est indisponible dans le catalogue actuel.",
    "en": "This offer is unavailable in the current catalog."
  },
  "Retirer de la sélection": {
    "fr": "Retirer de la sélection",
    "en": "Remove from selection"
  },
  "Cette offre n'existe plus.": {
    "fr": "Cette offre n'existe plus.",
    "en": "This deal no longer exists."
  },
  "Vendeur :": {
    "fr": "Vendeur :",
    "en": "Seller:"
  },
  "Prix de référence affiché": {
    "fr": "Prix de référence affiché",
    "en": "Observed reference price"
  },
  "Voir chez le vendeur": {
    "fr": "Voir chez le vendeur",
    "en": "Go to seller"
  },
  "Alerte de prix": {
    "fr": "Alerte de prix",
    "en": "Price alert"
  },
  "Le prix et la disponibilité doivent être vérifiés sur le site du vendeur avant l'achat.": {
    "fr": "Le prix et la disponibilité doivent être vérifiés sur le site du vendeur avant l'achat.",
    "en": "Prices and availability must be verified on the seller's website before purchase."
  },
  "Vous pouvez comparer 4 offres au maximum.": {
    "fr": "Vous pouvez comparer 4 offres au maximum.",
    "en": "You can compare up to 4 deals."
  },
  "Sélectionné": {
    "fr": "Sélectionné",
    "en": "Selected"
  },
  "Ancien prix": {
    "fr": "Ancien prix",
    "en": "Reference price"
  },
  "Réduction affichée": {
    "fr": "Réduction affichée",
    "en": "Displayed discount"
  },
  "Score automatique v1 : réduction (50), stock (20), description/image (10), marchand vérifié (20).": {
    "fr": "Score automatique v1 : réduction (50), stock (20), description/image (10), marchand vérifié (20).",
    "en": "Automatic score v1: discount (50), stock (20), description/image (10), verified merchant (20)."
  },
  "Score éditorial saisi par l’administrateur.": {
    "fr": "Score éditorial saisi par l’administrateur.",
    "en": "Editorial score entered by an administrator."
  },
  "Sans prédiction de prix.": {
    "fr": "Sans prédiction de prix.",
    "en": "No price prediction."
  },
  "Voir l'offre": {
    "fr": "Voir l'offre",
    "en": "View deal"
  },
  "Indiquez un prix valide.": {
    "fr": "Indiquez un prix valide.",
    "en": "Please enter a valid price."
  },
  "Enregistrement de l’alerte…": {
    "fr": "Enregistrement de l’alerte…",
    "en": "Saving price alert…"
  },
  "Cette offre n’est plus disponible.": {
    "fr": "Cette offre n’est plus disponible.",
    "en": "This offer is no longer available."
  },
  "Supprimer": {
    "fr": "Supprimer",
    "en": "Remove"
  },
  "Objectif": {
    "fr": "Objectif",
    "en": "Target"
  },
  "Actuel": {
    "fr": "Actuel",
    "en": "Current"
  },
  "Devise modifiée : actualisez cette alerte": {
    "fr": "Devise modifiée : actualisez cette alerte",
    "en": "Currency changed: update this alert"
  },
  "Seuil atteint": {
    "fr": "Seuil atteint",
    "en": "Target reached"
  },
  "En attente": {
    "fr": "En attente",
    "en": "Monitoring"
  },
  "Alerte supprimée.": {
    "fr": "Alerte supprimée.",
    "en": "Alert removed."
  },
  "Impossible de se déconnecter.": {
    "fr": "Impossible de se déconnecter.",
    "en": "Unable to sign out."
  },
  "Déconnexion réussie.": {
    "fr": "Déconnexion réussie.",
    "en": "Logged out."
  },
  "Accès administrateur requis.": {
    "fr": "Accès administrateur requis.",
    "en": "Administrator access required."
  }
};
Object.assign(messages,{
 'Modifier':{fr:'Modifier',en:'Edit'},
 'Enregistrement…':{fr:'Enregistrement…',en:'Saving…'},
 'sélectionnée':{fr:'sélectionnée',en:'selected'},
 'sélectionnées':{fr:'sélectionnées',en:'selected'},
 'offre':{fr:'offre',en:'deal'},'offres':{fr:'offres',en:'deals'},
 'Français sélectionné.':{fr:'Français sélectionné.',en:'English selected.'}
});
const storageKey='dealbot_language_v2';
let language='fr';
try{language=localStorage.getItem(storageKey)==='en'?'en':'fr';}catch{}
const normalize=s=>String(s).replace(/\s+/g,' ').trim();
function t(key){
 const source=String(key),entry=messages[normalize(source)];
 if(!entry)return source;
 return (source.match(/^\s*/)?.[0]||'')+entry[language]+(source.match(/\s*$/)?.[0]||'');
}
function apply(){
 document.querySelectorAll('[data-i18n]').forEach(el=>{
  const key=el.dataset.i18n, entry=messages[key];
  if(!entry)return;
  // Do not overwrite account names or titles changed by an async render.
  const value=normalize(el.textContent);
  if(value===key||value===entry.fr||value===entry.en)el.textContent=entry[language];
 });
 for(const attr of ['placeholder','aria-label','title'])document.querySelectorAll('[data-i18n-'+attr+']').forEach(el=>el.setAttribute(attr,t(el.getAttribute('data-i18n-'+attr))));
 document.documentElement.lang=language;
}
function setLanguage(lang){language=lang==='en'?'en':'fr';apply();return language;}
root.DealBotI18n={t,setLanguage,apply,messages,storageKey,get language(){return language;}};
document.addEventListener('invalid',event=>{
 const el=event.target;if(!el.validity)return;el.setCustomValidity('');
 const v=el.validity;
 if(v.valueMissing)el.setCustomValidity(t('Veuillez remplir ce champ.'));
 else if(v.typeMismatch)el.setCustomValidity(t('Veuillez saisir une adresse email valide.'));
 else if(v.tooShort||v.tooLong)el.setCustomValidity(t('Veuillez respecter la longueur demandée.'));
 else if(!v.valid)el.setCustomValidity(t('Veuillez vérifier la valeur saisie.'));
},true);
document.addEventListener('input',event=>event.target.setCustomValidity?.(''));
apply();
})(window);

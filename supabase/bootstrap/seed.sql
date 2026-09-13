-- Reference taxonomy only. No offers, merchants, users or credentials.
insert into public.categories(slug,name_fr,name_en,sort_order) values
('technology','Technologie','Technology',10),('fashion','Mode','Fashion',20),('home','Maison','Home',30),
('beauty','Beauté','Beauty',40),('sports','Sport','Sports',50),('travel','Voyage','Travel',60),
('gaming','Gaming','Gaming',70),('accessories','Accessoires','Accessories',80),('other','Autres','Other',999);
insert into public.ad_slots(slug,name,location) values
('home-top','Accueil — Haut','home_top'),('home-middle','Accueil — Milieu','home_middle'),
('explore-top','Explorer — Haut','explore_top'),('deal-detail','Fiche deal','deal_detail');

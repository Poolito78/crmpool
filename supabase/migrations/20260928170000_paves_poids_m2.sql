-- Poids des pavés synthétiques à coller ISOMARK : 8 kg par m² (règle du
-- chargé d'affaires, 28/09/2026), tous formats. Vendus au m², `poids` est le
-- poids d'UN m² ; c'est lui qui entre dans le port ISOMARK (tranche au poids).
update public.produits set poids = 8 where reference like 'PAVPREF%';

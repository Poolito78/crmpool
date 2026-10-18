' ============================================================
'  EXPORT AUTOMATIQUE - Agent mail MonCRM
'
'  A coller dans ThisOutlookSession, PAS dans un module :
'   Alt+F11 > Projet1 > Microsoft Outlook Objects > ThisOutlookSession.
'  Si ThisOutlookSession a deja un Application_Startup, y ajouter les deux
'  lignes de celui-ci au lieu d'en coller un second.
'  Exige le module ExporterMailsNonLus (ExporterMailsAgent, ExporterUnMail).
'
'  - Au demarrage d'Outlook : rattrapage silencieux de ce qui est arrive
'    Outlook ferme (memes regles que le bouton).
'  - A l'arrivee d'un mail dans la boite de reception : export immediat.
'  MonCRM relit le dossier toutes les minutes tant que l'Agent mail est
'  ouvert, et quand on revient sur son onglet.
'
'  Outlook doit executer les macros : Fichier > Options > Centre de gestion
'  de la confidentialite > Parametres des macros. Redemarrer Outlook apres
'  avoir colle ce code.
' ============================================================

Private WithEvents mailsRecus As Outlook.Items

Private Sub Application_Startup()
    Set mailsRecus = Application.GetNamespace("MAPI").GetDefaultFolder(olFolderInbox).Items
    On Error Resume Next
    ExporterMailsAgent True
End Sub

Private Sub mailsRecus_ItemAdd(ByVal Item As Object)
    ' Un mail qui ne s'exporte pas ne doit jamais gener Outlook.
    On Error Resume Next
    If Item.Class = olMail Then ExporterUnMail Item
End Sub

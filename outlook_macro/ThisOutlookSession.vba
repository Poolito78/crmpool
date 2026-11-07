' ============================================================
'  EXPORT AUTOMATIQUE - Agent mail MonCRM
'
'  A coller dans ThisOutlookSession, PAS dans un module :
'   Alt+F11 > Projet1 > Microsoft Outlook Objects > ThisOutlookSession.
'  REMPLACE tout le code precedent de l'Agent mail dans ThisOutlookSession.
'  Si ThisOutlookSession a un autre Application_Startup, y ajouter ses lignes
'  au lieu d'en coller un second.
'  Exige le module ExporterMailsNonLus.
'
'  - Au demarrage d'Outlook : rattrapage silencieux (memes regles que le
'    bouton) : exporte ce qui est arrive, range ce qui est deja traite.
'  - A l'arrivee d'un mail dans la boite de reception : export immediat.
'  - Mail repondu : range tout de suite. Mail envoye, recu ou retire de la
'    boite : nouveau passage complet, au plus toutes les 10 minutes.
'  MonCRM relit le dossier toutes les minutes tant que l'Agent mail est
'  ouvert, et quand on revient sur son onglet.
'
'  Outlook doit executer les macros : Fichier > Options > Centre de gestion
'  de la confidentialite > Parametres des macros. Redemarrer Outlook apres
'  avoir colle ce code.
' ============================================================

Private WithEvents mailsRecus As Outlook.Items
Private WithEvents mailsEnvoyes As Outlook.Items

Private Sub Application_Startup()
    Set mailsRecus = Application.GetNamespace("MAPI").GetDefaultFolder(olFolderInbox).Items
    Set mailsEnvoyes = Application.GetNamespace("MAPI").GetDefaultFolder(olFolderSentMail).Items
    On Error Resume Next
    ExporterMailsAgent True
End Sub

' Partout : un mail qui ne s'exporte pas ne doit jamais gener Outlook.
Private Sub mailsRecus_ItemAdd(ByVal Item As Object)
    On Error Resume Next
    If Item.Class = olMail Then ExporterUnMail Item
    RepasserSiBesoin
End Sub

Private Sub mailsRecus_ItemChange(ByVal Item As Object)
    On Error Resume Next
    If Item.Class = olMail Then RangerSiRepondu Item
End Sub

Private Sub mailsRecus_ItemRemove()
    On Error Resume Next
    RepasserSiBesoin
End Sub

Private Sub mailsEnvoyes_ItemAdd(ByVal Item As Object)
    On Error Resume Next
    RepasserSiBesoin
End Sub

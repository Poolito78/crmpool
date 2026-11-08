' ============================================================
'  DRAPEAUX ET ARCHIVAGE - Agent mail MonCRM
'
'  A coller dans un NOUVEAU module, en plus des autres :
'   Alt+F11 > Insertion > Module > coller ce code.
'  A installer AVANT de mettre a jour ThisOutlookSession, qui l'appelle.
'
'  MonCRM trie les mails (demande de devis ou non) mais ne peut pas ecrire dans
'  Outlook : il depose ses ordres dans commandes-outlook.txt (dossier des mails),
'  une ligne par mail : ACTION <TAB> nom du .msg. Ce module les applique puis
'  efface le fichier.
'   DRAPEAU  : demande de devis a realiser -> drapeau "aujourd'hui".
'   RETIRER  : mail ecarte dans MonCRM -> retire le drapeau pose ici.
'   ARCHIVER : "Ranger (traite)" dans MonCRM -> retire le drapeau, archive.
'
'  Le drapeau tombe aussi tout seul quand le mail est repondu, ou archive depuis
'  Outlook. Seuls les drapeaux poses ici sont retires (texte TEXTE_DRAPEAU) :
'  un drapeau mis a la main n'est jamais touche, sauf par "Ranger (traite)".
' ============================================================

Private Const TEXTE_DRAPEAU As String = "Devis a realiser"
Private Const JOURS_MAX As Integer = 30
Private Const MINUTES_ENTRE_PASSAGES As Integer = 10
Private Const FICHIER_COMMANDES As String = "commandes-outlook.txt"

Private dernierPassageDrapeaux As Date

' Appelee a chaque mail recu, envoye ou retire de la boite (ThisOutlookSession).
Public Sub AppliquerDrapeauxSiBesoin()
    If Now - dernierPassageDrapeaux >= MINUTES_ENTRE_PASSAGES / 1440 Then AppliquerDrapeaux
End Sub

Public Sub AppliquerDrapeaux()
    Dim commandes As Object
    Dim aArchiver As New Collection
    Dim liste     As Object
    Dim it        As Object
    Dim archive   As Object
    Dim limite    As Date
    Dim v         As Variant

    dernierPassageDrapeaux = Now
    limite = Now - JOURS_MAX
    Set commandes = LireCommandes()
    Set liste = Application.GetNamespace("MAPI").GetDefaultFolder(6).Items   ' olFolderInbox
    liste.Sort "[ReceivedTime]", True

    For Each it In liste
        If it.Class = 43 Then                                          ' olMail
            If it.ReceivedTime < limite Then Exit For
            AppliquerCommande it, commandes, aArchiver
            If EstRepondu(it) Then RetirerNotreDrapeau it
        End If
    Next it

    ' Apres la boucle : deplacer un mail pendant le parcours en saute un autre.
    Set archive = DossierArchive()
    If archive Is Nothing Then Exit Sub
    On Error Resume Next
    For Each v In aArchiver
        v.ClearTaskFlag
        v.Save
        v.Move archive
    Next v
    On Error GoTo 0
    NettoyerArchive archive
End Sub

Private Sub AppliquerCommande(ByVal it As Object, ByVal commandes As Object, ByVal aArchiver As Collection)
    Dim nom As String
    nom = NomDuMail(it)
    If Not commandes.Exists(nom) Then Exit Sub
    On Error Resume Next
    Select Case commandes(nom)
        Case "DRAPEAU"
            ' Deja marque a la main : on le laisse tel quel.
            If it.FlagStatus <> 2 Then                                 ' olFlagMarked
                it.MarkAsTask 0                                        ' olMarkToday
                it.FlagRequest = TEXTE_DRAPEAU
                it.Save
            End If
        Case "RETIRER"
            RetirerNotreDrapeau it
        Case "ARCHIVER"
            aArchiver.Add it
    End Select
End Sub

Private Sub RetirerNotreDrapeau(ByVal it As Object)
    On Error Resume Next
    If it.FlagRequest = TEXTE_DRAPEAU Then
        it.ClearTaskFlag
        it.Save
    End If
End Sub

' Le mail archive depuis Outlook garde son drapeau : on le retire ici.
Private Sub NettoyerArchive(ByVal archive As Object)
    Dim lot As New Collection
    Dim it  As Object
    Dim v   As Variant
    On Error Resume Next
    For Each it In archive.Items.Restrict("[FlagStatus] = 2")
        If it.FlagRequest = TEXTE_DRAPEAU Then lot.Add it
    Next it
    For Each v In lot
        RetirerNotreDrapeau v
    Next v
End Sub

Private Function DossierArchive() As Object
    On Error Resume Next
    Set DossierArchive = Application.GetNamespace("MAPI").GetDefaultFolder(6).Parent.Folders("Archive")
End Function

' Repondu, repondu a tous ou transfere : PR_LAST_VERB_EXECUTED (102, 103, 104).
Private Function EstRepondu(ByVal it As Object) As Boolean
    Dim verbe As Long
    On Error Resume Next
    verbe = it.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x10810003")
    On Error GoTo 0
    EstRepondu = (verbe >= 102 And verbe <= 104)
End Function

' Le fichier est efface une fois lu : un ordre sur un mail sorti de la boite est perdu.
Private Function LireCommandes() As Object
    Dim res    As Object
    Dim chemin As String
    Dim ligne  As String
    Dim f      As Integer
    Dim p      As Long

    Set res = CreateObject("Scripting.Dictionary")
    res.CompareMode = 1                                                ' vbTextCompare
    Set LireCommandes = res
    chemin = Environ("USERPROFILE") & "\OneDrive - ISOSIGN\Documents\MonCRM\Mails a traiter\" & FICHIER_COMMANDES
    If Dir(chemin) = "" Then Exit Function

    On Error Resume Next
    f = FreeFile
    Open chemin For Input As #f
    Do While Not EOF(f)
        Line Input #f, ligne
        p = InStr(ligne, vbTab)
        If p > 0 Then res(Mid(ligne, p + 1)) = Left(ligne, p - 1)
    Loop
    Close #f
    Kill chemin
End Function

' Memes regles que NomDuMail / NomFichierMail du module ExporterMailsNonLus
' (privees la-bas) : c'est le nom du .msg qui designe le mail.
Private Function NomDuMail(ByVal it As Object) As String
    NomDuMail = Format(it.ReceivedTime, "yyyymmdd-hhnn") & " - " & NomFichierMail(it.Subject) & ".msg"
End Function

Private Function NomFichierMail(ByVal s As String) As String
    Dim i As Long
    Dim c As String
    Dim r As String
    For i = 1 To Len(s)
        c = Mid(s, i, 1)
        If InStr("\/:*?""<>|", c) > 0 Or AscW(c) < 32 Or AscW(c) > 255 Then
            r = r & "_"
        Else
            r = r & c
        End If
    Next i
    r = Trim(r)
    If Len(r) > 80 Then r = Left(r, 80)
    Do While Len(r) > 0 And (Right(r, 1) = "." Or Right(r, 1) = " ")
        r = Left(r, Len(r) - 1)
    Loop
    If r = "" Then r = "sans objet"
    NomFichierMail = r
End Function

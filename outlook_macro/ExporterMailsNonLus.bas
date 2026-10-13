' ============================================================
'  MACRO OUTLOOK - Agent mail MonCRM
'  Enregistre les mails NON LUS de la boite de reception en .msg
'  dans le dossier lu par MonCRM, puis ouvre l'Agent mail.
'
'  Installation (une fois) :
'   1. Outlook : Alt+F11 > Insertion > Module > coller ce code.
'   2. Fichier > Options > Barre d'outils Acces rapide > Choisir les
'      commandes : Macros > ExporterMailsNonLus > Ajouter.
'   3. Dans MonCRM, Agent mail > « Choisir le dossier » : designer
'      Documents\MonCRM\Mails a traiter (cree par la macro au 1er lancement).
'
'  Les mails restent NON LUS dans Outlook. Un mail deja exporte (present
'  dans le dossier ou dans son sous-dossier Traites) n'est pas reexporte.
' ============================================================

Private Function DossierMailsCRM() As String
    DossierMailsCRM = Environ("USERPROFILE") & "\OneDrive - ISOSIGN\Documents\MonCRM\Mails a traiter\"
End Function

' ------------------------------------------------------------
Sub ExporterMailsNonLus()

    ' Constantes locales : la macro peut etre collee sous JoindreDevisPDF,
    ' dans le meme module, sans erreur de compilation.
    Const URL_AGENT_MAIL As String = "https://crmpool.vercel.app/?agentMail=1"
    Const JOURS_MAILS As Integer = 14      ' mails non lus des 14 derniers jours

    Dim dossier As String
    Dim boite   As Object
    Dim liste   As Object
    Dim it      As Object
    Dim nom     As String
    Dim limite  As Date
    Dim n       As Long

    dossier = DossierMailsCRM()
    CreerDossierMail dossier
    CreerDossierMail dossier & "Traites\"

    limite = Now - JOURS_MAILS
    Set boite = Application.GetNamespace("MAPI").GetDefaultFolder(6)   ' olFolderInbox
    Set liste = boite.Items.Restrict("[UnRead] = True")

    For Each it In liste
        If it.Class = 43 Then                                          ' olMail
            If it.ReceivedTime >= limite Then
                nom = Format(it.ReceivedTime, "yyyymmdd-hhnn") & " - " & NomFichierMail(it.Subject) & ".msg"
                If Dir(dossier & nom) = "" And Dir(dossier & "Traites\" & nom) = "" Then
                    On Error Resume Next
                    it.SaveAs dossier & nom, 9                         ' olMSGUnicode
                    If Err.Number = 0 Then n = n + 1
                    Err.Clear
                    On Error GoTo 0
                End If
            End If
        End If
    Next it

    ' Ouvre MonCRM sur l'Agent mail, qui lit le dossier.
    CreateObject("Shell.Application").ShellExecute URL_AGENT_MAIL

    If n = 0 Then
        Application.ActiveExplorer.StatusBar = "MonCRM : aucun nouveau mail non lu a exporter."
    End If

End Sub

' ------------------------------------------------------------
Private Sub CreerDossierMail(ByVal chemin As String)
    Dim parties() As String
    Dim courant   As String
    Dim i         As Integer
    If Right(chemin, 1) = "\" Then chemin = Left(chemin, Len(chemin) - 1)
    parties = Split(chemin, "\")
    courant = parties(0)
    For i = 1 To UBound(parties)
        courant = courant & "\" & parties(i)
        If Dir(courant, vbDirectory) = "" Then MkDir courant
    Next i
End Sub

' Objet du mail -> nom de fichier Windows valide (80 caracteres maximum).
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

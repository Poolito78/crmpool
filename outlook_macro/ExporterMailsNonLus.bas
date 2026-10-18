' ============================================================
'  MACRO OUTLOOK - Agent mail MonCRM
'  Enregistre les mails A TRAITER de la boite de reception en .msg
'  dans le dossier lu par MonCRM, puis ouvre l'Agent mail.
'
'  Installation (une fois) :
'   1. Outlook : Alt+F11 > Insertion > Module > coller ce code.
'   2. Fichier > Options > Barre d'outils Acces rapide > Choisir les
'      commandes : Macros > ExporterMailsNonLus > Ajouter.
'   3. Dans MonCRM, Agent mail > "Choisir le dossier" : designer
'      Documents\MonCRM\Mails a traiter (cree par la macro au 1er lancement).
'   4. EXPORT AUTOMATIQUE (recommande) : coller aussi ThisOutlookSession.vba
'      dans ThisOutlookSession. Sans lui, MonCRM ne voit que ce que la macro
'      a exporte a son dernier lancement : "Relire" relit le dossier, il ne
'      peut pas interroger Outlook.
'
'  Un mail est A TRAITER (MailATraiter) s'il est :
'   - NON LU, recu dans les 14 derniers jours ;
'   - LU SANS REPONSE, recu dans les 7 derniers jours : ouvert dans le volet
'     de lecture, le chiffrage n'en reste pas moins attendu ;
'   - A SUIVRE (drapeau), recu dans les 30 derniers jours ;
'   - ou recu dans les 2 derniers jours, quel que soit son etat.
'  L'IA de MonCRM trie ensuite : ce qui n'est pas une demande reste masque.
'  Les mails restent NON LUS dans Outlook. Un mail deja exporte (present
'  dans le dossier ou dans son sous-dossier Traites) n'est pas reexporte.
'  "Ouvrir dans Outlook" (MonCRM) : l'EntryID de chaque mail est note dans
'  entryids.txt ; executer une fois outlook_macro\lien-outlook.reg.
' ============================================================

Private erreurExport As String

Private Function DossierMailsCRM() As String
    DossierMailsCRM = Environ("USERPROFILE") & "\OneDrive - ISOSIGN\Documents\MonCRM\Mails a traiter\"
End Function

' ------------------------------------------------------------
' Le bouton de la barre d'outils : export, puis MonCRM s'ouvre.
Sub ExporterMailsNonLus()
    ExporterMailsAgent False
End Sub

' ------------------------------------------------------------
' Parcourt la boite de reception et exporte les mails a traiter.
' silencieux = True : ni fenetre ni navigateur (demarrage d'Outlook).
Public Sub ExporterMailsAgent(ByVal silencieux As Boolean)

    ' Constantes locales : la macro peut etre collee sous JoindreDevisPDF,
    ' dans le meme module, sans erreur de compilation.
    Const URL_AGENT_MAIL As String = "https://crmpool.vercel.app/?agentMail=1"
    Const JOURS_MAX As Integer = 30        ' le plus long des delais de MailATraiter

    Dim liste      As Object
    Dim it         As Object
    Dim maintenant As Date
    Dim n          As Long      ' exportes
    Dim deja       As Long      ' deja presents (dossier ou Traites)
    Dim echecs     As Long

    maintenant = Now
    erreurExport = ""
    ' Du plus recent au plus ancien, et l'on s'arrete a la limite. (Pas de
    ' Restrict sur la date : son format depend des reglages regionaux.)
    Set liste = Application.GetNamespace("MAPI").GetDefaultFolder(6).Items   ' olFolderInbox
    liste.Sort "[ReceivedTime]", True

    For Each it In liste
        If it.Class = 43 Then                                          ' olMail
            If it.ReceivedTime < maintenant - JOURS_MAX Then Exit For
            If MailATraiter(it, maintenant) Then
                Select Case ExporterUnMail(it)
                    Case 1: n = n + 1
                    Case 0: deja = deja + 1
                    Case Else: echecs = echecs + 1
                End Select
            End If
        End If
    Next it

    If silencieux Then Exit Sub

    ' Ouvre MonCRM sur l'Agent mail, qui lit le dossier.
    CreateObject("Shell.Application").ShellExecute URL_AGENT_MAIL

    ' (Un Explorer Outlook n'a pas de barre d'etat accessible : erreur 438.)
    If echecs > 0 Then
        MsgBox n & " mail(s) exporte(s), " & echecs & " en echec." & vbCrLf & vbCrLf & _
               "Premier echec : " & erreurExport, vbExclamation, "Agent mail MonCRM"
    ElseIf n = 0 Then
        MsgBox "Aucun nouveau mail a exporter" & _
               IIf(deja > 0, " (" & deja & " deja dans MonCRM).", "."), vbInformation, "Agent mail MonCRM"
    End If

End Sub

' ------------------------------------------------------------
' Enregistre un mail dans le dossier. Rend 1 (exporte), 0 (deja present,
' dans le dossier ou dans Traites) ou -1 (echec, motif dans erreurExport).
' Appelee aussi par ThisOutlookSession a l'arrivee de chaque mail.
Public Function ExporterUnMail(ByVal it As Object) As Integer
    Dim dossier As String
    Dim nom     As String

    dossier = DossierMailsCRM()
    CreerDossierMail dossier
    CreerDossierMail dossier & "Traites\"

    nom = Format(it.ReceivedTime, "yyyymmdd-hhnn") & " - " & NomFichierMail(it.Subject) & ".msg"
    If Dir(dossier & nom) <> "" Or Dir(dossier & "Traites\" & nom) <> "" Then
        ExporterUnMail = 0
    Else
        On Error Resume Next
        it.SaveAs dossier & nom, 9                                     ' olMSGUnicode
        If Err.Number = 0 Then
            ExporterUnMail = 1
        Else
            ExporterUnMail = -1
            If erreurExport = "" Then erreurExport = it.Subject & " : " & Err.Description
        End If
        Err.Clear
        On Error GoTo 0
    End If

    ' Deja present : indexe quand meme (mail exporte avant l'index).
    If ExporterUnMail >= 0 Then
        On Error Resume Next
        IndexerMail dossier, nom, it.EntryID
        Err.Clear
        On Error GoTo 0
    End If
End Function

' ------------------------------------------------------------
' Note l'EntryID du mail dans entryids.txt (nom du .msg <TAB> EntryID) :
' MonCRM en fait un lien outlook:<EntryID>, qui rouvre le mail dans la boite
' (une fois par poste : executer outlook_macro\lien-outlook.reg).
' Ecrit en ANSI ; MonCRM le lit en windows-1252.
Private Sub IndexerMail(ByVal dossier As String, ByVal nom As String, ByVal entryId As String)
    Dim f       As Integer
    Dim contenu As String
    Dim chemin  As String

    chemin = dossier & "entryids.txt"
    If Dir(chemin) <> "" Then
        f = FreeFile
        Open chemin For Binary Access Read As #f
        contenu = Space$(LOF(f))
        Get #f, , contenu
        Close #f
        If InStr(1, contenu, nom & vbTab, vbBinaryCompare) > 0 Then Exit Sub
    End If
    f = FreeFile
    Open chemin For Append As #f
    Print #f, nom & vbTab & entryId
    Close #f
End Sub

' ------------------------------------------------------------
' Les regles de l'en-tete. Un mail lu n'est pas un mail traite : tant
' qu'on n'y a pas repondu, le chiffrage est attendu.
Private Function MailATraiter(ByVal it As Object, ByVal maintenant As Date) As Boolean
    Const JOURS_NON_LUS As Integer = 14
    Const JOURS_SANS_REPONSE As Integer = 7
    Const JOURS_SUIVI As Integer = 30
    Const JOURS_TOUS As Integer = 2        ' aujourd'hui et hier : tout

    Dim age As Double
    age = maintenant - it.ReceivedTime

    If it.ReceivedTime >= Date - JOURS_TOUS + 1 Then
        MailATraiter = True
    ElseIf it.FlagStatus = 2 And age <= JOURS_SUIVI Then               ' olFlagMarked
        MailATraiter = True
    ElseIf it.UnRead Then
        MailATraiter = (age <= JOURS_NON_LUS)
    ElseIf age <= JOURS_SANS_REPONSE Then
        MailATraiter = SansReponse(it)
    End If
End Function

' Ni repondu, ni repondu a tous, ni transfere : PR_LAST_VERB_EXECUTED
' (102, 103, 104). Propriete absente = jamais repondu.
Private Function SansReponse(ByVal it As Object) As Boolean
    Dim verbe As Long
    On Error Resume Next
    verbe = it.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x10810003")
    On Error GoTo 0
    SansReponse = (verbe < 102 Or verbe > 104)
End Function

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

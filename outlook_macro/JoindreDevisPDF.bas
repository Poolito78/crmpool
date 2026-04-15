Attribute VB_Name = "JoindreDevisPDF"
' ============================================================
'  MACRO OUTLOOK — Joindre automatiquement le PDF du devis
'  Dossier source : C:\Users\f.mouhot\OneDrive - ISOSIGN\
'                   Documents\ISOFLOOR\04 Vente\Préco\
'
'  Fonctionnement :
'    1. Lit l'objet du mail pour trouver le n° de devis (DEV-YYYY-NNN)
'    2. Cherche Devis_DEV-YYYY-NNN.pdf dans le dossier Préco
'    3. Joint le fichier s'il existe
' ============================================================

Sub JoindreDevisPDF()

    Const PRECO_FOLDER As String = _
        "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\04 Vente\Préco\"

    Dim objItem   As Object
    Dim strSubjet As String
    Dim strNum    As String
    Dim strPath   As String
    Dim regex     As Object
    Dim matches   As Object

    ' --- Récupérer le message en cours de rédaction ---
    On Error Resume Next
    Set objItem = Application.ActiveInspector.CurrentItem
    On Error GoTo 0

    If objItem Is Nothing Then
        MsgBox "Aucun message ouvert en rédaction.", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    strSubjet = objItem.Subject

    ' --- Extraire le numéro de devis (ex : DEV-2024-001) ---
    Set regex = CreateObject("VBScript.RegExp")
    regex.Pattern = "DEV-\d{4}-\d+"
    regex.IgnoreCase = True
    regex.Global = False

    Set matches = regex.Execute(strSubjet)

    If matches.Count = 0 Then
        ' Essayer dans le corps du mail
        Set matches = regex.Execute(objItem.Body)
    End If

    If matches.Count = 0 Then
        MsgBox "Numéro de devis introuvable dans l'objet ou le corps du mail." & vbCrLf & _
               "(Format attendu : DEV-2024-001)", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    strNum  = matches(0).Value                         ' ex: DEV-2024-001
    strPath = PRECO_FOLDER & "Devis_" & strNum & ".pdf"

    ' --- Vérifier l'existence du fichier ---
    If Dir(strPath) = "" Then
        MsgBox "Fichier introuvable :" & vbCrLf & strPath & vbCrLf & vbCrLf & _
               "Vérifiez que le PDF a bien été généré depuis le CRM.", _
               vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    ' --- Vérifier si déjà joint ---
    Dim att As Object
    For Each att In objItem.Attachments
        If att.FileName = "Devis_" & strNum & ".pdf" Then
            If MsgBox("Le fichier est déjà en pièce jointe." & vbCrLf & _
                      "Joindre quand même une deuxième fois ?", _
                      vbQuestion + vbYesNo, "Joindre PDF devis") = vbNo Then
                Exit Sub
            End If
            Exit For
        End If
    Next att

    ' --- Joindre le PDF ---
    objItem.Attachments.Add strPath
    objItem.Save   ' sauvegarde le brouillon

    MsgBox "PDF joint avec succès :" & vbCrLf & "Devis_" & strNum & ".pdf", _
           vbInformation, "Joindre PDF devis"

End Sub

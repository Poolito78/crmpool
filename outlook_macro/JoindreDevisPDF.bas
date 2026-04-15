' ============================================================
'  MACRO OUTLOOK - Joindre le PDF du devis + fiches produits
'  Coller ce code dans un module VBA Outlook (Alt+F11)
' ============================================================

Private Function DossierPreco() As String
    DossierPreco = "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\04 Vente\Pr" & Chr(233) & "co\"
End Function

Private Function DossierFiches() As String
    DossierFiches = "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches Produit\"
End Function

' ------------------------------------------------------------
Sub JoindreDevisPDF()

    Dim objItem     As Object
    Dim strNum      As String
    Dim strPdf      As String
    Dim strRefsFile As String
    Dim strRefs     As String
    Dim arrRefs()   As String
    Dim ref         As String
    Dim fiche       As String
    Dim nomF        As String
    Dim nbJoints    As Integer
    Dim msg         As String
    Dim i           As Integer
    Dim insp        As Object
    Dim nbInsp      As Integer

    ' Methode 1 : fenetre de composition active
    On Error Resume Next
    Set objItem = Application.ActiveInspector.CurrentItem
    On Error GoTo 0

    ' Methode 2 : fenetre active (si methode 1 echoue)
    If objItem Is Nothing Then
        On Error Resume Next
        Set objItem = Application.ActiveWindow.CurrentItem
        On Error GoTo 0
    End If

    ' Methode 3 : parcourir tous les inspecteurs ouverts
    If objItem Is Nothing Then
        nbInsp = 0
        On Error Resume Next
        nbInsp = Application.Inspectors.Count
        On Error GoTo 0
        For Each insp In Application.Inspectors
            On Error Resume Next
            If Not insp Is Nothing Then
                If insp.CurrentItem.Class = 43 Then
                    Set objItem = insp.CurrentItem
                End If
            End If
            On Error GoTo 0
            If Not objItem Is Nothing Then Exit For
        Next insp
    End If

    ' Methode 4 : explorer les fenetres via Application.ActiveExplorer
    If objItem Is Nothing Then
        On Error Resume Next
        Dim exp As Object
        Set exp = Application.ActiveExplorer
        If Not exp Is Nothing Then
            If exp.Selection.Count > 0 Then
                If exp.Selection.Item(1).Class = 43 Then
                    Set objItem = exp.Selection.Item(1)
                End If
            End If
        End If
        On Error GoTo 0
    End If

    If objItem Is Nothing Then
        MsgBox "Aucun message ouvert en redaction." & vbCrLf & vbCrLf & _
               "Astuces :" & vbCrLf & _
               "  - Le message doit etre ouvert dans sa propre fenetre" & vbCrLf & _
               "  - Cliquer dans le corps du message puis sur le bouton" & vbCrLf & _
               "  - Ou executer depuis VBA (Alt+F11) avec F5" & vbCrLf & vbCrLf & _
               "Inspectors detectes : " & nbInsp, _
               vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    strNum = TrouverNumeroDevis(objItem.Subject)
    If strNum = "" Then strNum = TrouverNumeroDevis(objItem.Body)

    If strNum = "" Then
        MsgBox "Numero de devis introuvable (format DEV-2026-001)." & vbCrLf & _
               "Verifiez l'objet du message.", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    nbJoints = 0
    msg = "Devis " & strNum & " :" & vbCrLf

    ' -- PDF du devis
    strPdf = DossierPreco() & "Devis_" & strNum & ".pdf"
    If Dir(strPdf) <> "" Then
        If Not DejaJoint(objItem, "Devis_" & strNum & ".pdf") Then
            objItem.Attachments.Add strPdf
            nbJoints = nbJoints + 1
            msg = msg & vbCrLf & "  [OK] Devis_" & strNum & ".pdf"
        Else
            msg = msg & vbCrLf & "  [--] Devis_" & strNum & ".pdf (deja joint)"
        End If
    Else
        msg = msg & vbCrLf & "  [NON] PDF introuvable :" & vbCrLf & "  " & strPdf
    End If

    ' -- Fiches produits
    strRefsFile = DossierPreco() & "Devis_" & strNum & "_refs.txt"
    If Dir(strRefsFile) <> "" Then
        strRefs = LireFichier(strRefsFile)
        strRefs = Replace(strRefs, Chr(13) & Chr(10), Chr(10))
        strRefs = Replace(strRefs, Chr(13), Chr(10))
        If strRefs <> "" Then
            arrRefs = Split(strRefs, Chr(10))
            msg = msg & vbCrLf & vbCrLf & "Fiches produits :"
            For i = 0 To UBound(arrRefs)
                ref = Trim(arrRefs(i))
                If ref <> "" Then
                    fiche = ChercherDansDossier(DossierFiches(), ref)
                    If fiche <> "" Then
                        nomF = NomFichier(fiche)
                        If Not DejaJoint(objItem, nomF) Then
                            objItem.Attachments.Add fiche
                            nbJoints = nbJoints + 1
                            msg = msg & vbCrLf & "  [OK] " & nomF
                        Else
                            msg = msg & vbCrLf & "  [--] " & nomF & " (deja joint)"
                        End If
                    Else
                        msg = msg & vbCrLf & "  [NON] Fiche introuvable : " & ref
                    End If
                End If
            Next i
        End If
    Else
        msg = msg & vbCrLf & vbCrLf & _
              "Info : _refs.txt absent - cliquez 'Enregistrer PDF' dans le CRM."
    End If

    If nbJoints > 0 Then objItem.Save

    If nbJoints > 0 Then
        MsgBox msg, vbInformation, "Joindre PDF devis"
    Else
        MsgBox msg, vbExclamation, "Joindre PDF devis"
    End If

End Sub

' ------------------------------------------------------------
Private Function TrouverNumeroDevis(strTexte As String) As String
    Dim pos    As Long
    Dim j      As Long
    Dim c      As String
    Dim extrait As String

    TrouverNumeroDevis = ""
    pos = InStr(1, strTexte, "DEV-", vbTextCompare)
    If pos = 0 Then Exit Function

    j = pos + 4
    Do While j <= Len(strTexte)
        c = Mid(strTexte, j, 1)
        If c = " " Or c = Chr(9) Or c = Chr(10) Or c = Chr(13) Or _
           c = ")" Or c = "]" Or c = "," Or c = ";" Then
            Exit Do
        End If
        j = j + 1
    Loop

    extrait = Mid(strTexte, pos, j - pos)
    If Len(extrait) >= 10 Then TrouverNumeroDevis = extrait
End Function

' ------------------------------------------------------------
' Extrait les mots-cles significatifs d'une description produit
' - Garde les codes tout en MAJUSCULES (>= 2 chars) ex: "SNL", "LE", "SF41"
' - Garde les mots communs de plus de 2 chars non stopwords
Private Function ExtraireMots(strRef As String) As String()
    Dim clean    As String
    Dim parties() As String
    Dim result() As String
    Dim i As Integer, n As Integer
    Dim motOrig As String, mot As String
    Dim stopWords As String
    Dim estCode As Boolean

    stopWords = "|de|du|des|en|et|ou|un|une|par|sur|au|aux|kg|"

    clean = strRef
    clean = Replace(clean, "(", " ")
    clean = Replace(clean, ")", " ")
    clean = Replace(clean, ",", " ")
    clean = Replace(clean, ".", " ")
    clean = Replace(clean, "-", " ")
    clean = Replace(clean, "_", " ")

    parties = Split(clean, " ")
    ReDim result(UBound(parties))
    n = 0

    For i = 0 To UBound(parties)
        motOrig = Trim(parties(i))
        If motOrig <> "" Then
            mot = LCase(motOrig)
            ' Code produit : tout en majuscules, >= 2 chars, pas numerique pur
            estCode = (motOrig = UCase(motOrig)) And Len(motOrig) >= 2 And Not IsNumeric(motOrig)
            ' Nombre de 3+ chiffres = code modele produit (ex: 319, 1000, 405)
            Dim estNombreProduit As Boolean
            estNombreProduit = IsNumeric(motOrig) And Len(motOrig) >= 3

            If estCode Or estNombreProduit Then
                result(n) = mot
                n = n + 1
            ElseIf Len(mot) > 2 And Not IsNumeric(mot) And InStr(stopWords, "|" & mot & "|") = 0 Then
                result(n) = mot
                n = n + 1
            End If
        End If
    Next i

    If n = 0 Then
        ReDim result(0)
        result(0) = LCase(Trim(strRef))
    Else
        ReDim Preserve result(n - 1)
    End If

    ExtraireMots = result
End Function

' ------------------------------------------------------------
' Correspondance par mots-cles (bExact=True : tous les mots, False : au moins 2/3+)
Private Function FichierCorrespond(strNomFichier As String, strRef As String, bExact As Boolean) As Boolean
    Dim nomN   As String
    Dim mots() As String
    Dim mot    As String
    Dim i      As Integer
    Dim nTotal As Integer
    Dim nFound As Integer

    FichierCorrespond = False

    nomN = LCase(strNomFichier)
    nomN = Replace(nomN, "-", " ")
    nomN = Replace(nomN, "_", " ")
    nomN = Replace(nomN, ".", " ")

    mots = ExtraireMots(strRef)
    nTotal = 0
    nFound = 0

    For i = 0 To UBound(mots)
        mot = Trim(mots(i))
        If mot <> "" Then
            nTotal = nTotal + 1
            If InStr(nomN, mot) > 0 Then nFound = nFound + 1
        End If
    Next i

    If nTotal = 0 Then Exit Function

    If bExact Then
        FichierCorrespond = (nFound = nTotal)
    Else
        ' Partiel : tous trouves, ou au moins 2 sur 3+
        FichierCorrespond = (nFound = nTotal) Or (nTotal >= 3 And nFound >= 2)
    End If
End Function

' ------------------------------------------------------------
' Recherche recursive avec mode exact ou partiel
Private Function ChercherRec(strDossier As String, strRef As String, bExact As Boolean) As String
    Dim fso    As Object
    Dim folder As Object
    Dim subF   As Object
    Dim fich   As Object
    Dim found  As String

    ChercherRec = ""
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(strDossier) Then Exit Function

    Set folder = fso.GetFolder(strDossier)

    For Each fich In folder.Files
        If LCase(Right(fich.Name, 4)) = ".pdf" Then
            If FichierCorrespond(fich.Name, strRef, bExact) Then
                ChercherRec = fich.Path
                Exit Function
            End If
        End If
    Next fich

    For Each subF In folder.SubFolders
        found = ChercherRec(subF.Path, strRef, bExact)
        If found <> "" Then
            ChercherRec = found
            Exit Function
        End If
    Next subF
End Function

' ------------------------------------------------------------
' Double passe : exact d'abord, puis partiel si rien trouve
Private Function ChercherDansDossier(strDossier As String, strRef As String) As String
    ChercherDansDossier = ChercherRec(strDossier, strRef, True)
    If ChercherDansDossier = "" Then
        ChercherDansDossier = ChercherRec(strDossier, strRef, False)
    End If
End Function

' ------------------------------------------------------------
Private Function LireFichier(strPath As String) As String
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2          ' texte
    stream.Charset = "UTF-8"
    stream.Open
    stream.LoadFromFile strPath
    LireFichier = stream.ReadText
    stream.Close
End Function

' ------------------------------------------------------------
Private Function NomFichier(strPath As String) As String
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    NomFichier = fso.GetFileName(strPath)
End Function

' ------------------------------------------------------------
Private Function DejaJoint(objItem As Object, strNom As String) As Boolean
    Dim att As Object
    DejaJoint = False
    For Each att In objItem.Attachments
        If LCase(att.FileName) = LCase(strNom) Then
            DejaJoint = True
            Exit Function
        End If
    Next att
End Function

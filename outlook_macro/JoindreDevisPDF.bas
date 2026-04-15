Attribute VB_Name = "JoindreDevisPDF"
' ============================================================
'  MACRO OUTLOOK - Joindre le PDF du devis + fiches produits
' ============================================================

Private Const PRECO_FOLDER As String = _
    "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\04 Vente\Pr" & Chr(233) & "co\"

Private Const FICHES_FOLDER As String = _
    "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches Produit\"

' ------------------------------------------------------------
'  Point d'entree principal
' ------------------------------------------------------------
Sub JoindreDevisPDF()

    Dim objItem   As Object
    Dim strNum    As String
    Dim strPdf    As String
    Dim strRefs   As String
    Dim arrRefs() As String
    Dim i         As Integer
    Dim nbJoints  As Integer
    Dim msg       As String

    On Error Resume Next
    Set objItem = Application.ActiveInspector.CurrentItem
    On Error GoTo 0

    If objItem Is Nothing Then
        MsgBox "Aucun message ouvert en redaction.", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    strNum = ExtraireNumeroDevis(objItem.Subject & " " & objItem.Body)

    If strNum = "" Then
        MsgBox "Numero de devis introuvable (format DEV-YYYY-NNN)." & vbCrLf & _
               "Verifiez l'objet ou le corps du message.", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    nbJoints = 0
    msg = "Devis " & strNum & " :" & vbCrLf

    ' -- 1. PDF du devis ------------------------------------
    strPdf = PRECO_FOLDER & "Devis_" & strNum & ".pdf"

    If Dir(strPdf) <> "" Then
        If Not DejaJoint(objItem, "Devis_" & strNum & ".pdf") Then
            objItem.Attachments.Add strPdf
            nbJoints = nbJoints + 1
            msg = msg & vbCrLf & "  [OK] Devis_" & strNum & ".pdf"
        Else
            msg = msg & vbCrLf & "  [--] Devis_" & strNum & ".pdf (deja joint)"
        End If
    Else
        msg = msg & vbCrLf & "  [NON] PDF devis introuvable dans :" & vbCrLf & _
              "        " & PRECO_FOLDER
    End If

    ' -- 2. Fiches produits --------------------------------
    Dim strRefsFile As String
    strRefsFile = PRECO_FOLDER & "Devis_" & strNum & "_refs.txt"

    If Dir(strRefsFile) <> "" Then
        strRefs = LireFichier(strRefsFile)
        If strRefs <> "" Then
            ' Gerer les fins de ligne Windows (\r\n) et Unix (\n)
            strRefs = Replace(strRefs, Chr(13) & Chr(10), Chr(10))
            strRefs = Replace(strRefs, Chr(13), Chr(10))
            arrRefs = Split(strRefs, Chr(10))
            msg = msg & vbCrLf & vbCrLf & "Fiches produits :"
            For i = 0 To UBound(arrRefs)
                Dim ref As String
                ref = Trim(arrRefs(i))
                If ref = "" Then GoTo SuivantRef

                Dim fichePath As String
                fichePath = ChercherDansDossier(FICHES_FOLDER, ref)

                If fichePath <> "" Then
                    Dim nomFiche As String
                    nomFiche = NomFichier(fichePath)
                    If Not DejaJoint(objItem, nomFiche) Then
                        objItem.Attachments.Add fichePath
                        nbJoints = nbJoints + 1
                        msg = msg & vbCrLf & "  [OK] " & nomFiche
                    Else
                        msg = msg & vbCrLf & "  [--] " & nomFiche & " (deja joint)"
                    End If
                Else
                    msg = msg & vbCrLf & "  [NON] Fiche introuvable : " & ref
                End If
SuivantRef:
            Next i
        End If
    Else
        msg = msg & vbCrLf & vbCrLf & _
              "Info : fichier _refs.txt absent." & vbCrLf & _
              "Utilisez 'Enregistrer PDF' ou 'Envoyer' depuis le CRM pour le generer."
    End If

    ' -- 3. Sauvegarde + resume ----------------------------
    If nbJoints > 0 Then objItem.Save

    MsgBox msg, IIf(nbJoints > 0, vbInformation, vbExclamation), "Joindre PDF devis"

End Sub

' ------------------------------------------------------------
Private Function ExtraireNumeroDevis(strTexte As String) As String
    Dim regex   As Object
    Dim matches As Object
    Set regex = CreateObject("VBScript.RegExp")
    regex.Pattern = "DEV-\d{4}-\d+"
    regex.IgnoreCase = True
    regex.Global = False
    Set matches = regex.Execute(strTexte)
    If matches.Count > 0 Then
        ExtraireNumeroDevis = matches(0).Value
    Else
        ExtraireNumeroDevis = ""
    End If
End Function

' ------------------------------------------------------------
Private Function ChercherDansDossier(strDossier As String, strRef As String) As String
    Dim fso     As Object
    Dim folder  As Object
    Dim subF    As Object
    Dim fichier As Object
    Dim ref     As String

    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(strDossier) Then Exit Function

    Set folder = fso.GetFolder(strDossier)
    ref = LCase(Trim(strRef))

    For Each fichier In folder.Files
        If LCase(Right(fichier.Name, 4)) = ".pdf" Then
            If InStr(LCase(fichier.Name), ref) > 0 Then
                ChercherDansDossier = fichier.Path
                Exit Function
            End If
        End If
    Next fichier

    For Each subF In folder.SubFolders
        Dim found As String
        found = ChercherDansDossier(subF.Path, strRef)
        If found <> "" Then
            ChercherDansDossier = found
            Exit Function
        End If
    Next subF
End Function

' ------------------------------------------------------------
Private Function LireFichier(strPath As String) As String
    Dim fso As Object
    Dim f   As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.OpenTextFile(strPath, 1, False, -1)
    LireFichier = f.ReadAll
    f.Close
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
    For Each att In objItem.Attachments
        If LCase(att.FileName) = LCase(strNom) Then
            DejaJoint = True
            Exit Function
        End If
    Next att
    DejaJoint = False
End Function

Attribute VB_Name = "JoindreDevisPDF"
' ============================================================
'  MACRO OUTLOOK — Joindre le PDF du devis + fiches produits
'
'  Dossier Préco  : C:\Users\f.mouhot\OneDrive - ISOSIGN\
'                   Documents\ISOFLOOR\04 Vente\Préco\
'  Fiches produit : C:\Users\f.mouhot\OneDrive - ISOSIGN\
'                   Documents\ISOFLOOR\02 MARKETING\Fiches Produit\
' ============================================================

Private Const PRECO_FOLDER As String = _
    "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\04 Vente\Préco\"

Private Const FICHES_FOLDER As String = _
    "C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches Produit\"

' ------------------------------------------------------------
'  Point d'entrée principal
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

    ' --- Message en cours de rédaction ---
    On Error Resume Next
    Set objItem = Application.ActiveInspector.CurrentItem
    On Error GoTo 0

    If objItem Is Nothing Then
        MsgBox "Aucun message ouvert en rédaction.", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    ' --- Extraire le numéro de devis ---
    strNum = ExtraireNumeroDevis(objItem.Subject & " " & objItem.Body)

    If strNum = "" Then
        MsgBox "Numéro de devis introuvable (format DEV-YYYY-NNN)." & vbCrLf & _
               "Vérifiez l'objet ou le corps du message.", vbExclamation, "Joindre PDF devis"
        Exit Sub
    End If

    nbJoints = 0
    msg = "Devis " & strNum & " :" & vbCrLf

    ' ── 1. PDF du devis ─────────────────────────────────────
    strPdf = PRECO_FOLDER & "Devis_" & strNum & ".pdf"

    If Dir(strPdf) <> "" Then
        If Not DejaJoint(objItem, "Devis_" & strNum & ".pdf") Then
            objItem.Attachments.Add strPdf
            nbJoints = nbJoints + 1
            msg = msg & vbCrLf & "  ✔ Devis_" & strNum & ".pdf"
        Else
            msg = msg & vbCrLf & "  — Devis_" & strNum & ".pdf (déjà joint)"
        End If
    Else
        msg = msg & vbCrLf & "  ✗ PDF devis introuvable dans Préco"
    End If

    ' ── 2. Fiches produits via fichier refs ─────────────────
    Dim strRefsFile As String
    strRefsFile = PRECO_FOLDER & "Devis_" & strNum & "_refs.txt"

    If Dir(strRefsFile) <> "" Then
        strRefs = LireFichier(strRefsFile)
        If strRefs <> "" Then
            arrRefs = Split(strRefs, vbLf)
            msg = msg & vbCrLf & vbCrLf & "Fiches produits :"
            For i = 0 To UBound(arrRefs)
                Dim ref As String
                ref = Trim(arrRefs(i))
                If ref = "" Then GoTo SuivantRef

                Dim fichePath As String
                fichePath = TrouverFicheProduit(ref)

                If fichePath <> "" Then
                    Dim nomFiche As String
                    nomFiche = NomFichier(fichePath)
                    If Not DejaJoint(objItem, nomFiche) Then
                        objItem.Attachments.Add fichePath
                        nbJoints = nbJoints + 1
                        msg = msg & vbCrLf & "  ✔ " & nomFiche & " (" & ref & ")"
                    Else
                        msg = msg & vbCrLf & "  — " & nomFiche & " (déjà joint)"
                    End If
                Else
                    msg = msg & vbCrLf & "  ✗ Fiche introuvable : " & ref
                End If
SuivantRef:
            Next i
        End If
    Else
        msg = msg & vbCrLf & vbCrLf & "(Fichier _refs.txt absent — fiches produits non jointes)"
    End If

    ' ── 3. Sauvegarde + résumé ──────────────────────────────
    If nbJoints > 0 Then objItem.Save

    MsgBox msg, IIf(nbJoints > 0, vbInformation, vbExclamation), "Joindre PDF devis"

End Sub

' ------------------------------------------------------------
'  Extraire le numéro de devis (ex: DEV-2024-001)
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
'  Chercher une fiche produit par référence (récursif)
'  Retourne le chemin complet ou "" si non trouvé
' ------------------------------------------------------------
Private Function TrouverFicheProduit(strRef As String) As String
    TrouverFicheProduit = ChercherDansDossier(FICHES_FOLDER, strRef)
End Function

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

    ' Chercher dans les fichiers du dossier courant
    For Each fichier In folder.Files
        If LCase(Right(fichier.Name, 4)) = ".pdf" Then
            If InStr(LCase(fichier.Name), ref) > 0 Then
                ChercherDansDossier = fichier.Path
                Exit Function
            End If
        End If
    Next fichier

    ' Chercher récursivement dans les sous-dossiers
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
'  Lire le contenu d'un fichier texte
' ------------------------------------------------------------
Private Function LireFichier(strPath As String) As String
    Dim fso  As Object
    Dim f    As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.OpenTextFile(strPath, 1, False, -2) ' -2 = UTF-8
    LireFichier = f.ReadAll
    f.Close
End Function

' ------------------------------------------------------------
'  Extraire le nom de fichier depuis un chemin
' ------------------------------------------------------------
Private Function NomFichier(strPath As String) As String
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    NomFichier = fso.GetFileName(strPath)
End Function

' ------------------------------------------------------------
'  Vérifier si un fichier est déjà joint
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

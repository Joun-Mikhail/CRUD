# Finalise a pandoc-generated thesis DOCX in Microsoft Word and export it to PDF.
# Called by scripts/docs/build_thesis.py. Formats tables, updates the contents and the lists of
# figures and tables, and exports a PDF with heading bookmarks. Word must be installed.
param([Parameter(Mandatory = $true)][string]$Docx, [Parameter(Mandatory = $true)][string]$Pdf)
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($Docx, $false, $false)
    foreach ($t in $doc.Tables) {
        $first = $t.Cell(1, 1).Range.Text.Trim([char]13, [char]7, ' ')
        $t.Range.Cells.PreferredWidthType = 1   # wdPreferredWidthAuto: drop pandoc's equal widths
        $t.AllowAutoFit = $true
        $t.Range.Font.Size = 10
        $t.Range.ParagraphFormat.Alignment = 0
        # column widths proportional to the longest cell text (capped), table = 100 % of text width
        $n = $t.Columns.Count; $w = @()
        for ($c = 1; $c -le $n; $c++) {
            $m = 0; $longest = 0
            foreach ($cell in $t.Columns.Item($c).Cells) {
                $text = $cell.Range.Text
                if ($text.Length -gt $m) { $m = $text.Length }
                foreach ($token in ($text -split '\s+')) { if ($token.Length -gt $longest) { $longest = $token.Length } }
            }
            $w += [Math]::Max([Math]::Min($m, 55), 1.8 * $longest) + 4
        }
        $sum = ($w | Measure-Object -Sum).Sum
        $t.AllowAutoFit = $false
        $textWidth = $doc.PageSetup.PageWidth - $doc.PageSetup.LeftMargin - $doc.PageSetup.RightMargin
        for ($c = 1; $c -le $n; $c++) {
            $t.Columns.Item($c).Width = [Math]::Round($textWidth * $w[$c - 1] / $sum, 1)
        }
        $t.Rows.AllowBreakAcrossPages = $true
        if ($first -eq '') {           # key/value table without a header (declaration): no borders
            $t.Borders.Enable = $false
            continue
        }
        $t.Borders.Enable = $true
        $t.Borders.InsideColor = 12566463     # light grey (BGR)
        $t.Borders.OutsideColor = 8421504
        $t.Rows.Item(1).HeadingFormat = -1
        $t.Rows.Item(1).Range.ParagraphFormat.KeepWithNext = -1
        $t.Rows.Item(1).Range.Font.Bold = $true
        $t.Rows.Item(1).Shading.BackgroundPatternColor = 15527148
        $t.TopPadding = 1; $t.BottomPadding = 1
    }
    $doc.Sections.Item(1).PageSetup.DifferentFirstPageHeaderFooter = -1
    for ($i = 0; $i -lt 2; $i++) {
        $doc.Fields.Update() | Out-Null
        foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
    }
    $doc.Save()
    # ExportAsFixedFormat(path, wdExportFormatPDF, open, optimizeForPrint, range, from, to, item,
    #                     includeProps, keepIRM, createHeadingBookmarks, docStructureTags, bitmapMissingFonts, useISO19005)
    $doc.ExportAsFixedFormat($Pdf, 17, $false, 0, 0, 1, 1, 0, $true, $true, 1, $true, $true, $false)
    $doc.Close($false)
}
finally {
    if ($word.Documents.Count -eq 0) { $word.Quit() }   # never close documents the user has open
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

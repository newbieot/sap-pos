from __future__ import annotations

import contextlib
import http.server
import socketserver
import threading
import time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / 'docs' / 'screenshots'
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

SHEETJS_STUB = r'''
(function(){
  const headers=[' No.  AWB ','PENERIMA','Telepon','Alamat','Isi','Berat','Nilai COD','Pengirim',''];
  const codFormatted=[headers,
    ['001234567890','Zara Aulia','081234567890','Batam Center','Paket A','2','Rp 25.000','SAP BATAM',''],
    ['009876543210','Adi Putra','081298765432','Batu Aji','Paket C','','invalid','',''],
    ['','Skipped Row','081100000000','Nongsa','Paket B','1','10.000','SAP BATAM','']
  ];
  const codRaw=[headers,
    ['001234567890','Zara Aulia','081234567890','Batam Center','Paket A',2,'Rp 25.000','SAP BATAM',''],
    ['009876543210','Adi Putra','081298765432','Batu Aji','Paket C','','invalid','',''],
    ['','Skipped Row','081100000000','Nongsa','Paket B',1,'10.000','SAP BATAM','']
  ];
  const nonFormatted=[headers,
    ['NC002','Zed Maulana','081300000002','Tanjungpinang','Documents','1','','',''],
    ['NC001','Ana Putri','081300000001','Batam','Documents','1','','SAP OFFICE','']
  ];
  const nonRaw=JSON.parse(JSON.stringify(nonFormatted));
  const workbook={SheetNames:['COD','NON COD (SPESIAL HANDLING)','NOTES'],Sheets:{
    COD:{formattedRows:codFormatted,rawRows:codRaw},
    'NON COD (SPESIAL HANDLING)':{formattedRows:nonFormatted,rawRows:nonRaw},
    NOTES:{formattedRows:[['Notes']],rawRows:[['Notes']]}
  }};
  function letters(index){let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
  window.XLSX={
    read(){return workbook},
    utils:{
      sheet_to_json(sheet,opts){return opts.raw?sheet.rawRows:sheet.formattedRows},
      json_to_sheet(data,opts){const ws={};opts.header.forEach((h,i)=>{const c=letters(i);ws[c+'1']={v:h,t:'s'};data.forEach((r,j)=>{const v=r[h];ws[c+(j+2)]={v:v,t:typeof v==='number'?'n':'s'}})});ws['!ref']='A1:'+letters(opts.header.length-1)+(data.length+1);return ws},
      book_new(){return {SheetNames:[],Sheets:{}}},
      book_append_sheet(wb,ws,name){wb.SheetNames.push(name);wb.Sheets[name]=ws}
    },
    write(){return new Uint8Array([80,75,3,4,20,0,0,0]).buffer}
  };
})();
'''

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

@contextlib.contextmanager
def local_server():
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_address[1]}'
        finally:
            server.shutdown()
            thread.join(timeout=2)


def route_sheetjs(route):
    route.fulfill(status=200, content_type='application/javascript', body=SHEETJS_STUB)


def no_horizontal_overflow(page):
    return page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')


def label_image(image_path: Path, label: str) -> Image.Image:
    image = Image.open(image_path).convert('RGB')
    top = 52
    canvas = Image.new('RGB', (image.width, image.height + top), '#ffffff')
    canvas.paste(image, (0, top))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except Exception:
        font = None
    draw.text((18, 13), label, fill='#172554', font=font)
    return canvas


def make_footer_comparison():
    left = label_image(SCREENSHOTS / 'template-mile-footer-reference.png', 'Template MILE reference')
    right = label_image(SCREENSHOTS / 'desktop-footer.png', 'SAPX redesign')
    target_h = max(left.height, right.height)
    if left.height != target_h:
        bg = Image.new('RGB', (left.width, target_h), '#ffffff'); bg.paste(left, (0,0)); left = bg
    if right.height != target_h:
        bg = Image.new('RGB', (right.width, target_h), '#ffffff'); bg.paste(right, (0,0)); right = bg
    gap = 22
    combined = Image.new('RGB', (left.width + right.width + gap, target_h), '#dfe5ef')
    combined.paste(left, (0,0)); combined.paste(right, (left.width + gap,0))
    combined.save(SCREENSHOTS / 'footer-comparison.png', optimize=True)


def build_inline_app():
    import re
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    css=(ROOT/'assets/css/app.css').read_text(encoding='utf-8')
    scripts=[
      SHEETJS_STUB,
      (ROOT/'assets/js/workbook-parser.js').read_text(encoding='utf-8'),
      (ROOT/'assets/js/converters.js').read_text(encoding='utf-8'),
      (ROOT/'assets/js/validation.js').read_text(encoding='utf-8'),
      (ROOT/'assets/js/export.js').read_text(encoding='utf-8'),
      (ROOT/'assets/js/app.js').read_text(encoding='utf-8'),
    ]
    html=re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
    html=re.sub(r'<script src="[^"]+" defer></script>', '', html)
    html=html.replace('</head>', '<style>'+css+'</style></head>')
    html=html.replace('</body>', ''.join('<script>'+script+'</script>' for script in scripts)+'</body>')
    return html


def load_app(page, inline_html):
    page.set_content(inline_html, wait_until='load')
    page.wait_for_function("document.querySelector('#activityLog').textContent.includes('Converter ready')")


def main():
    console_errors=[]
    inline_html=build_inline_app()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000}, device_scale_factor=1, accept_downloads=True)
        page=context.new_page()
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        load_app(page, inline_html)
        page.screenshot(path=str(SCREENSHOTS/'desktop-homepage.png'), full_page=False)
        assert page.locator('html').get_attribute('lang') == 'en'
        assert page.locator('#processButton').is_disabled()
        assert no_horizontal_overflow(page)

        page.locator('#fileInput').set_input_files(str(ROOT/'tests/fixtures/validation-warning.xlsx'))
        page.locator('#codSheetBadge').wait_for(state='visible')
        page.wait_for_function("document.querySelector('#codSheetBadge').textContent.includes('Detected')")
        page.screenshot(path=str(SCREENSHOTS/'upload-state.png'), full_page=False)
        page.locator('#workbookPanel').screenshot(path=str(SCREENSHOTS/'workbook-inspection.png'))
        page.locator('.validation-card').screenshot(path=str(SCREENSHOTS/'validation-warning.png'))
        page.locator('.preview-card').screenshot(path=str(SCREENSHOTS/'cod-preview.png'))
        assert page.locator('#metricCod').inner_text() == '2'
        assert page.locator('#metricNonCod').inner_text() == '2'
        assert page.locator('#metricSkipped').inner_text() == '1'

        page.locator('#nonCodTab').click()
        page.locator('.preview-card').screenshot(path=str(SCREENSHOTS/'noncod-preview.png'))

        with page.expect_download() as first_download:
            page.locator('#processButton').click()
        first_download.value.cancel()
        page.wait_for_function("document.querySelectorAll('.generated-file').length === 2")
        page.locator('#resultsPanel').screenshot(path=str(SCREENSHOTS/'generated-files.png'))
        assert page.locator('.generated-file').count() == 2
        assert page.locator('#metricGenerated').inner_text() == '2'

        with page.expect_download() as repeat_download:
            page.locator('.generated-file .download-button').first.click()
        repeat_download.value.cancel()

        page.locator('.dashboard-footer').scroll_into_view_if_needed()
        page.locator('.dashboard-footer').screenshot(path=str(SCREENSHOTS/'desktop-footer.png'))
        assert no_horizontal_overflow(page)

        xls_page=context.new_page(); load_app(xls_page, inline_html)
        xls_page.locator('#fileInput').set_input_files(str(ROOT/'tests/fixtures/valid-sapx.xls'))
        xls_page.wait_for_function("document.querySelector('#fileDetails').textContent.includes('XLS')")
        assert xls_page.locator('#metricCod').inner_text() == '2'
        xls_page.close()

        bad_page=context.new_page(); load_app(bad_page, inline_html)
        bad_page.locator('#fileInput').set_input_files(str(ROOT/'tests/fixtures/unsupported.txt'))
        bad_page.wait_for_function("document.querySelector('#toastRegion').textContent.includes('XLSX or XLS')")
        bad_page.close()

        drag_page=context.new_page(); load_app(drag_page, inline_html)
        drag_page.evaluate("""async () => { const data=new Uint8Array([1,2,3]); const f=new File([data],'dragged.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); const dt=new DataTransfer(); dt.items.add(f); document.querySelector('#dropZone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); }""")
        drag_page.wait_for_function("document.querySelector('#fileName').textContent === 'dragged.xlsx'")
        drag_page.close()

        mobile_context=browser.new_context(viewport={'width':390,'height':844}, device_scale_factor=1, accept_downloads=True)
        mobile=mobile_context.new_page(); load_app(mobile, inline_html)
        mobile.screenshot(path=str(SCREENSHOTS/'mobile-homepage.png'), full_page=False)
        assert no_horizontal_overflow(mobile)
        mobile.locator('.dashboard-footer').scroll_into_view_if_needed()
        mobile.locator('.dashboard-footer').screenshot(path=str(SCREENSHOTS/'mobile-footer.png'))
        footer_height=mobile.locator('.dashboard-footer').evaluate('el => el.getBoundingClientRect().height')
        assert round(footer_height) == 36
        mobile_context.close()

        reference=context.new_page()
        reference.set_content((ROOT/'tests/template-mile-footer-reference.html').read_text(encoding='utf-8'), wait_until='load')
        reference.locator('.dashboard-footer').screenshot(path=str(SCREENSHOTS/'template-mile-footer-reference.png'))
        reference.close()

        context.close(); browser.close()

    make_footer_comparison()
    if console_errors:
        raise AssertionError('Browser console errors: '+repr(console_errors))
    print('Browser regression passed. Screenshots generated:', len(list(SCREENSHOTS.glob('*.png'))))

if __name__ == '__main__':
    main()

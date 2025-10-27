"""
Script para criar ícones PWA do DumbMirror Remote Control
Cria ícones PNG de 192x192 e 512x512 a partir de SVG
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Instalando Pillow...")
    import subprocess
    subprocess.check_call(['pip', 'install', 'pillow'])
    from PIL import Image, ImageDraw, ImageFont

import os

def create_pwa_icon(size, output_path):
    """Cria um ícone PWA para DumbMirror"""
    
    # Criar imagem com fundo escuro
    img = Image.new('RGB', (size, size), color='#1a1a1a')
    draw = ImageDraw.Draw(img)
    
    # Dimensões proporcionais
    center = size // 2
    
    # Desenhar moldura do espelho (elipse)
    frame_rx = int(size * 0.35)  # 35% do tamanho
    frame_ry = int(size * 0.39)  # 39% do tamanho
    
    # Moldura externa (cinza escuro)
    draw.ellipse(
        [(center - frame_rx, center - frame_ry), 
         (center + frame_rx, center + frame_ry)],
        fill='#333333',
        outline='#555555',
        width=max(2, size // 64)
    )
    
    # Espelho interno (preto com transparência)
    inner_rx = int(size * 0.31)
    inner_ry = int(size * 0.35)
    draw.ellipse(
        [(center - inner_rx, center - inner_ry), 
         (center + inner_rx, center + inner_ry)],
        fill='#0a0a0a'
    )
    
    # Efeito de reflexo (elipse clara no topo)
    reflect_y = int(size * 0.35)
    reflect_rx = int(size * 0.27)
    reflect_ry = int(size * 0.19)
    draw.ellipse(
        [(center - reflect_rx, reflect_y - reflect_ry), 
         (center + reflect_rx, reflect_y + reflect_ry)],
        fill='#ffffff30'
    )
    
    # Indicadores LED (pontos coloridos)
    led_size = max(3, size // 64)
    led_top = int(size * 0.27)
    
    # LED verde (centro)
    draw.ellipse(
        [(center - led_size, led_top - led_size), 
         (center + led_size, led_top + led_size)],
        fill='#00ff88'
    )
    
    # LED azul (esquerda)
    led_left = center - int(size * 0.07)
    led_top_side = int(size * 0.29)
    draw.ellipse(
        [(led_left - led_size, led_top_side - led_size), 
         (led_left + led_size, led_top_side + led_size)],
        fill='#0088ff'
    )
    
    # LED rosa (direita)
    led_right = center + int(size * 0.07)
    draw.ellipse(
        [(led_right - led_size, led_top_side - led_size), 
         (led_right + led_size, led_top_side + led_size)],
        fill='#ff0088'
    )
    
    # Texto "DM" (DumbMirror)
    try:
        font_size_big = size // 8
        font_size_small = size // 16
        
        # Tenta usar fonte do sistema
        try:
            font_big = ImageFont.truetype("arial.ttf", font_size_big)
            font_small = ImageFont.truetype("arial.ttf", font_size_small)
        except:
            try:
                font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size_big)
                font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size_small)
            except:
                font_big = ImageFont.load_default()
                font_small = ImageFont.load_default()
        
        # Texto "DM"
        text_main = "DM"
        bbox = draw.textbbox((0, 0), text_main, font=font_big)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        text_x = center - text_width // 2
        text_y = int(size * 0.72)
        draw.text((text_x, text_y), text_main, fill='#ffffff', font=font_big)
        
        # Texto "Remote"
        text_sub = "Remote"
        bbox_small = draw.textbbox((0, 0), text_sub, font=font_small)
        text_width_small = bbox_small[2] - bbox_small[0]
        text_x_small = center - text_width_small // 2
        text_y_small = text_y + text_height + int(size * 0.02)
        draw.text((text_x_small, text_y_small), text_sub, fill='#00ff88', font=font_small)
        
    except Exception as e:
        print(f"Aviso: Erro ao adicionar texto: {e}")
    
    # Salvar
    img.save(output_path, 'PNG', quality=95)
    print(f"✅ Ícone criado: {output_path} ({size}x{size})")

def main():
    # Diretório de saída
    script_dir = os.path.dirname(os.path.abspath(__file__))
    img_dir = script_dir
    
    # Criar ícones
    print("🎨 Criando ícones PWA para DumbMirror Remote Control...")
    
    create_pwa_icon(192, os.path.join(img_dir, 'pwa-icon-192.png'))
    create_pwa_icon(512, os.path.join(img_dir, 'pwa-icon-512.png'))
    
    print("\n✨ Ícones PWA criados com sucesso!")
    print("\nPróximos passos:")
    print("1. Reinicie o MagicMirror")
    print("2. Acesse http://SEU_IP:8080/remote.html no celular")
    print("3. Toque no menu do navegador e selecione 'Adicionar à tela inicial'")
    print("4. Pronto! O app estará instalado como PWA")

if __name__ == '__main__':
    main()

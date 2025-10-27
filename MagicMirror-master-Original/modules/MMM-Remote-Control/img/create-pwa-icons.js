/**
 * Script Node.js para criar ícones PWA
 * Copia e renomeia o apple-touch-icon existente
 */

const fs = require('fs');
const path = require('path');

const imgDir = __dirname;
const sourceIcon = path.join(imgDir, 'apple-touch-icon.png');

// Verifica se o ícone fonte existe
if (!fs.existsSync(sourceIcon)) {
  console.error('❌ Arquivo apple-touch-icon.png não encontrado!');
  process.exit(1);
}

// Copia para os nomes PWA
const icons = [
  { name: 'pwa-icon-192.png' },
  { name: 'pwa-icon-512.png' }
];

console.log('🎨 Criando ícones PWA...\n');

icons.forEach(icon => {
  const targetPath = path.join(imgDir, icon.name);
  
  try {
    fs.copyFileSync(sourceIcon, targetPath);
    console.log(`✅ Criado: ${icon.name}`);
  } catch (error) {
    console.error(`❌ Erro ao criar ${icon.name}:`, error.message);
  }
});

console.log('\n✨ Ícones PWA criados com sucesso!');
console.log('\n📱 Próximos passos:');
console.log('1. Reinicie o MagicMirror (ou aguarde hot-reload)');
console.log('2. Acesse http://SEU_IP:8080/remote.html no celular');
console.log('3. No menu do navegador, selecione "Adicionar à tela inicial"');
console.log('4. Pronto! O app PWA está instalado! 🎉');
console.log('\n💡 Nota: Os ícones usam o apple-touch-icon.png existente.');
console.log('   Você pode substituir depois por ícones personalizados.');

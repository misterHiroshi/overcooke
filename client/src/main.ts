import './style.css'
import Phaser from 'phaser'
import { MainScene } from './scenes/MainScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'app',
  scene: [MainScene],
}

new Phaser.Game(config)

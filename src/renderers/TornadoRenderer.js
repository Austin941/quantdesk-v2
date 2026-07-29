export class TornadoRenderer {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.trackedBrokerName = null;
  }

  setTrackedBroker(name) {
    this.trackedBrokerName = name;
  }

  getTrackedBroker() {
    return this.trackedBrokerName;
  }

  draw(data, dateStr) {
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const titleEl = document.getElementById('drw-branches-title');
    if (titleEl) {
      titleEl.innerHTML = `券商分點進出 (${dateStr}) <span style="font-size:0.8em;color:#94a3b8">(滑動上方 K 線可切換日期)</span>`;
    }

    ctx.clearRect(0, 0, width, height);

    if (!data || (!data.top_buy && !data.top_sell)) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${dateStr} 無分點進出資料`, width / 2, height / 2);
      return;
    }

    const topBuy = data.top_buy || [];
    const topSell = data.top_sell || [];
    const maxLength = Math.max(topBuy.length, topSell.length);

    if (maxLength === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${dateStr} 無分點進出資料`, width / 2, height / 2);
      return;
    }

    // Determine max absolute net for scaling
    let maxAbs = 0;
    for (let i = 0; i < maxLength; i++) {
      if (topBuy[i] && Math.abs(topBuy[i].net) > maxAbs) maxAbs = Math.abs(topBuy[i].net);
      if (topSell[i] && Math.abs(topSell[i].net) > maxAbs) maxAbs = Math.abs(topSell[i].net);
    }
    if (maxAbs === 0) maxAbs = 1; // Prevent division by zero

    const chartTop = 30;
    const chartBottom = height - 30;
    const chartHeight = chartBottom - chartTop;
    const barSpacing = chartHeight / 15; // fixed to 15 bars max
    const barHeight = barSpacing * 0.8;
    const centerX = width / 2;
    const maxBarWidth = (width / 2) - 80; // Leave room for labels

    // Store labels for click detection
    this.currentLabels = [];

    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < maxLength; i++) {
      const buyNode = topBuy[i];
      const sellNode = topSell[i];
      const y = chartTop + i * barSpacing;

      this.currentLabels.push({
        buyName: buyNode ? buyNode.broker_name : '',
        sellName: sellNode ? sellNode.broker_name : ''
      });

      // Draw Buy (Left side)
      if (buyNode) {
        const val = buyNode.net;
        const barW = (val / maxAbs) * maxBarWidth;
        const isTracked = this.trackedBrokerName === buyNode.broker_name;
        const isDim = this.trackedBrokerName && !isTracked;
        
        ctx.fillStyle = isDim ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.8)';
        ctx.strokeStyle = isDim ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 1)';
        ctx.lineWidth = 1;
        
        // Draw bar from center to left
        ctx.beginPath();
        ctx.roundRect(centerX - barW, y + (barSpacing - barHeight)/2, barW, barHeight, 2);
        ctx.fill();
        ctx.stroke();

        // Draw text
        ctx.fillStyle = isDim ? 'rgba(148, 163, 184, 0.4)' : '#cbd5e1';
        ctx.textAlign = 'right';
        ctx.fillText(`${buyNode.broker_name} (${val})`, centerX - barW - 8, y + barSpacing/2);
      }

      // Draw Sell (Right side)
      if (sellNode) {
        const val = Math.abs(sellNode.net);
        const barW = (val / maxAbs) * maxBarWidth;
        const isTracked = this.trackedBrokerName === sellNode.broker_name;
        const isDim = this.trackedBrokerName && !isTracked;
        
        ctx.fillStyle = isDim ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.8)';
        ctx.strokeStyle = isDim ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 1)';
        ctx.lineWidth = 1;
        
        // Draw bar from center to right
        ctx.beginPath();
        ctx.roundRect(centerX, y + (barSpacing - barHeight)/2, barW, barHeight, 2);
        ctx.fill();
        ctx.stroke();

        // Draw text
        ctx.fillStyle = isDim ? 'rgba(148, 163, 184, 0.4)' : '#cbd5e1';
        ctx.textAlign = 'left';
        ctx.fillText(`${sellNode.broker_name} (${Math.abs(sellNode.net)})`, centerX + barW + 8, y + barSpacing/2);
      }
    }

    // Draw center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, chartTop - 10);
    ctx.lineTo(centerX, chartBottom + 10);
    ctx.stroke();
  }

  handleClick(mx, my, clientHeight, clientWidth, onBrokerTracked) {
    const chartTop = 30;
    const chartBottom = clientHeight - 30;
    const chartHeight = chartBottom - chartTop;
    const barSpacing = chartHeight / 15;

    if (my >= chartTop && my <= chartBottom) {
      const idx = Math.floor((my - chartTop) / barSpacing);
      if (this.currentLabels && idx >= 0 && idx < this.currentLabels.length) {
        const labels = this.currentLabels[idx];
        let clickedBroker = null;
        
        if (mx < clientWidth / 2) {
          clickedBroker = labels.buyName;
        } else {
          clickedBroker = labels.sellName;
        }
        
        if (clickedBroker) {
          if (this.trackedBrokerName === clickedBroker) {
            this.trackedBrokerName = null;
          } else {
            this.trackedBrokerName = clickedBroker;
          }
          if (onBrokerTracked) {
            onBrokerTracked(this.trackedBrokerName);
          }
        }
      }
    }
  }
}

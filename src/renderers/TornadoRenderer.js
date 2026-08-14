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
      titleEl.innerHTML = `主力券商分點買賣超排行榜 (${dateStr}) <span style="font-size:0.75rem;color:#94a3b8;font-weight:normal">(Top 15 分點多空對決)</span>`;
    }

    ctx.clearRect(0, 0, width, height);

    if (!data || (!data.top_buy && !data.top_sell)) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "SF Pro TC", "PingFang TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${dateStr} 暫無分點買賣超明細`, width / 2, height / 2);
      return;
    }

    const topBuy = data.top_buy || [];
    const topSell = data.top_sell || [];
    const maxLength = Math.min(15, Math.max(topBuy.length, topSell.length));

    if (maxLength === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "SF Pro TC", "PingFang TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${dateStr} 暫無分點買賣超明細`, width / 2, height / 2);
      return;
    }

    // Determine max absolute net for scaling
    let maxAbs = 0;
    for (let i = 0; i < maxLength; i++) {
      if (topBuy[i] && Math.abs(topBuy[i].net) > maxAbs) maxAbs = Math.abs(topBuy[i].net);
      if (topSell[i] && Math.abs(topSell[i].net) > maxAbs) maxAbs = Math.abs(topSell[i].net);
    }
    if (maxAbs === 0) maxAbs = 1;

    const chartTop = 32;
    const chartBottom = height - 12;
    const chartHeight = chartBottom - chartTop;
    const barSpacing = chartHeight / maxLength;
    const barHeight = Math.max(12, Math.min(16, barSpacing * 0.75));
    const centerX = width / 2;
    const maxBarWidth = (width / 2) - 105; // Room for broker name & numbers

    // Draw Column Headers (買超 / 賣超)
    ctx.font = 'bold 11px "SF Pro TC", "PingFang TC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f87171';
    ctx.fillText('◀ 買超分點 (張)', centerX - 12, 18);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#4ade80';
    ctx.fillText('賣超分點 (張) ▶', centerX + 12, 18);

    // Draw central axis
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 24);
    ctx.lineTo(centerX, height - 8);
    ctx.stroke();

    // Store labels for click detection
    this.currentLabels = [];
    ctx.textBaseline = 'middle';

    for (let i = 0; i < maxLength; i++) {
      const buyNode = topBuy[i];
      const sellNode = topSell[i];
      const y = chartTop + i * barSpacing;

      const buyName = buyNode ? (buyNode.broker_name || buyNode.name || '') : '';
      const sellName = sellNode ? (sellNode.broker_name || sellNode.name || '') : '';

      this.currentLabels.push({
        buyName,
        sellName
      });

      // Subtle background row guide
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent';
      ctx.fillRect(8, y, width - 16, barSpacing);

      // Draw Buy (Left side - Red)
      if (buyNode) {
        const val = buyNode.net;
        const barW = Math.max(2, (Math.abs(val) / maxAbs) * maxBarWidth);
        const isTracked = this.trackedBrokerName === buyName;
        const isDim = this.trackedBrokerName && !isTracked;
        
        ctx.fillStyle = isDim ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.85)';
        ctx.strokeStyle = isDim ? 'rgba(239, 68, 68, 0.25)' : '#ef4444';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.roundRect(centerX - barW, y + (barSpacing - barHeight)/2, barW, barHeight, 3);
        ctx.fill();
        ctx.stroke();

        // Name & Quantity
        ctx.font = '11px "SF Pro TC", "PingFang TC", monospace';
        ctx.fillStyle = isDim ? 'rgba(148, 163, 184, 0.35)' : '#e2e8f0';
        ctx.textAlign = 'right';
        const numStr = Number(val).toLocaleString();
        ctx.fillText(`${buyName}  +${numStr}`, centerX - barW - 6, y + barSpacing/2);
      }

      // Draw Sell (Right side - Green)
      if (sellNode) {
        const val = Math.abs(sellNode.net);
        const barW = Math.max(2, (val / maxAbs) * maxBarWidth);
        const isTracked = this.trackedBrokerName === sellName;
        const isDim = this.trackedBrokerName && !isTracked;
        
        ctx.fillStyle = isDim ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.85)';
        ctx.strokeStyle = isDim ? 'rgba(34, 197, 94, 0.25)' : '#22c55e';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.roundRect(centerX, y + (barSpacing - barHeight)/2, barW, barHeight, 3);
        ctx.fill();
        ctx.stroke();

        // Name & Quantity
        ctx.font = '11px "SF Pro TC", "PingFang TC", monospace';
        ctx.fillStyle = isDim ? 'rgba(148, 163, 184, 0.35)' : '#e2e8f0';
        ctx.textAlign = 'left';
        const numStr = Number(sellNode.net).toLocaleString();
        ctx.fillText(`${numStr}  ${sellName}`, centerX + barW + 6, y + barSpacing/2);
      }
    }
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

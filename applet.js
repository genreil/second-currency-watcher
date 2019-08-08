const Lang = imports.lang;
const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext.domain('cinnamon-applets');
const _ = Gettext.gettext;
const Gio = imports.gi.Gio;

const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Mainloop = imports.mainloop;

const Json = imports.gi.Json;
const Soup = imports.gi.Soup;
const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());

const app_name = "second-currency-watcher@gr";
const AppletDirectory = imports.ui.appletManager.appletMeta[app_name].path;
imports.searchPath.push(AppletDirectory);

function MyApplet(orientation) {
    this._init(orientation);
}

const currencies = ["AED","ANG","ARS","AUD","BDT","BGN","BHD","BND","BOB","BRL","BWP","CAD","CHF",
            "CLP","CNY","COP","CRC","CZK","DKK","DOP","DZD","EEK","EGP","EUR","FJD","GBP",
            "HKD","HNL","HRK","HUF","IDR","ILS","INR","JMD","JOD","JPY","KES","KRW","KWD",
            "KYD","KZT","LBP","LKR","LTL","LVL","MAD","MDL","MKD","MUR","MVR","MXN","MYR",
            "NAD","NGN","NIO","NOK","NPR","NZD","OMR","PEN","PGK","PHP","PKR","PLN","PYG",
            "QAR","RON","RSD","RUB","SAR","SCR","SEK","SGD","SKK","SLL","SVC","THB","TND",
            "TRY","TTD","TWD","TZS","UAH","UGX","USD","UYU","UZS","VEF","VND","XOF","YER",
            "ZAR","ZMK"];

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(orientation) {
        Applet.TextIconApplet.prototype._init.call(this, orientation);

        try {
            this.configs = new Gio.Settings({ schema: 'org.cinnamon.applets.'+app_name});
            this.previous_rate = this.configs.get_double('previous-rate');
            this.previous_up_down = this.configs.get_string('previous-up-down');
            this.refresh_interval = this.configs.get_int('refresh-interval');

            this.fromCurrency = "EUR";
            this.toCurrency = "ILS";

            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager.addMenu(this.menu);

            this.monitoringCurrencyMenuItem = new PopupMenu.PopupMenuItem("Monitoring: " + this.fromCurrency + "/" + this.toCurrency, { reactive: false });
            this.menu.addMenuItem(this.monitoringCurrencyMenuItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Slider:
            this.refresh_interval_label = "Refresh Interval (in seconds): ";
            this.timerMenuItem = new PopupMenu.PopupMenuItem(this.refresh_interval_label + this.refresh_interval.toString(), { reactive: false });
            this.menu.addMenuItem(this.timerMenuItem);
            this.timerSlider = new PopupMenu.PopupSliderMenuItem(this.refresh_interval * 0.825 / 100);
            this.timerSlider.connect('value-changed', Lang.bind(this, this.sliderChanged));
            this.menu.addMenuItem(this.timerSlider);

            // this.fromCurrencyMenu = new PopupMenu.PopupSubMenuMenuItem("From Currency");
            // this.setCurrencyMenuItems(this.fromCurrencyMenu, this.fromCurrency);
            // this.menu.addMenuItem(this.fromCurrencyMenu);

            // this.toCurrencyMenu = new PopupMenu.PopupSubMenuMenuItem("To Currency");
            // this.setCurrencyMenuItems(this.toCurrencyMenu, this.toCurrency);
            // this.menu.addMenuItem(this.toCurrencyMenu);

            var saved_up_down = this.previous_up_down == '' ? "invest-applet" : (AppletDirectory + '/icons/arrow' + this.previous_up_down + '.png');
            this.set_applet_icon_name(saved_up_down);
            var saved_rate = this.previous_rate != 0.0 ? this.previous_rate.toFixed(4).toString() : this.fromCurrency + "/" + this.toCurrency
            this.set_applet_label(saved_rate);
            this.monitoringCurrencyMenuItem.label.text = "Monitoring: " + this.fromCurrency + "/" + this.toCurrency;
            this.set_applet_tooltip("Currency Watcher");

            this.refreshCurrency();
        }
        catch (e) {
            global.logError(e);
        }
    },

    on_applet_clicked: function(event) {
        this.menu.toggle();
    },

    sliderChanged: function(slider, value) {
        let position = parseFloat(value);
        this.refresh_interval = Math.round(position/0.825 * 100);
        if (this.refresh_interval < 1) this.refresh_interval = 1;
        else if (this.refresh_interval > 120) this.refresh_interval = 120;
        this.timerMenuItem.label.text = this.refresh_interval_label + this.refresh_interval.toString();
        this.configs.set_int('refresh-interval', this.refresh_interval);
    },

    setCurrencyMenuItems: function(currencyMenu, givenCurrency) {
        let self = this;
        var length = currencies.length,
            currency = null;
        for (var i = 0; i < length; i++) {
            currency = currencies[i];
            this.currencyPopupMenuItem = new PopupMenu.PopupMenuItem(currency);
            currencyMenu.menu.addMenuItem(this.currencyPopupMenuItem);
            // this.currencyPopupMenuItem.connect('activate', Lang.bind(this,
            //     function(givenCurrency, currency){
            //         givenCurrency = currency;
            //         this.monitoringCurrencyMenuItem.label.text = "Monitoring: " + this.fromCurrency + "/" + this.toCurrency;
            //         this.notifyMsg('Monitoring ' + this.fromCurrency + "/" + this.toCurrency);
            //     },'_output'));
        }
    },

    load_json_async: function(url, fun) {
        let here = this;
        let message = Soup.Message.new('GET', this.convertion_url());
        try{
            _httpSession.queue_message(message, function(session, message) {
                // Main.Util.spawnCommandLine("notify-send -i dialog-information 'Currency Watcher: rate = " + message.response_body.data + "'");
                fun.call(here, message.response_body.data);
            });
        }
        catch(error) {
            this.notifyMsg('(ERROR) ' + error.toString());
        }
    },

    convertion_url: function(){
        // return "http://rate-exchange.appspot.com/currency?from=" + this.fromCurrency + "&to=" + this.toCurrency;
        // return "http://www.webservicex.net/CurrencyConvertor.asmx/ConversionRate?FromCurrency=" + this.fromCurrency + "&ToCurrency=" + this.toCurrency;
        // return "http://query.yahooapis.com/v1/public/yql?q=select%20rate%2Cname%20from%20csv%20where%20url%3D'http%3A%2F%2Fdownload.finance.yahoo.com%2Fd%2Fquotes%3Fs%3D"+this.fromCurrency+this.toCurrency+"%253DX%26f%3Dl1n'%20and%20columns%3D'rate%2Cname'&format=json&callback=parseExchangeRate"
        let url = "https://api.exchangeratesapi.io/latest?base=" + this.fromCurrency +  "&symbols=" + this.toCurrency;
        // this.notifyMsg('(URL) ' + url);
        return url;
    },

    refreshCurrency: function(){
        // this.notifyMsg('Current Interval is ' + this.refresh_interval.toString());

        this.load_json_async(this.convertion_url(), function(data) {
            // extract current rate:

            // The old for http://rate-exchange.appspot.com/...:
            // let current_rate = parseFloat(body.toString().replace( /^\D+/g, '').replace( /\D+$/g, '').substring(0,6)).toFixed(3);

            // For http://www.webservicex.net/CurrencyConvertor.asmx...:
            // let current_rate = parseFloat(body.toString().match(/>(.*)<\//)[1]).toFixed(4);

            // For http://query.yahooapis.com/v1/public/yql?...:
            // parseExchangeRate is returned by the yahoo api.
            // select * from yahoo.finance.xchange where pair in ("USDILS")

            // let current_rate = eval(body);

            let rate_pos_from = 16;
            let rate_pos_to = 25;
            let current_rate = parseFloat(data.substring(rate_pos_from, rate_pos_to)); // For testing: Math.floor(Math.random() * 10);
            if ( !isNaN(current_rate) ) {

                // find direction of the rate change:
                let current_up_down = '';
                if ( current_rate < this.previous_rate ) {
                    current_up_down = 'down';
                }
                else if ( current_rate > this.previous_rate ) {
                    current_up_down = 'up';
                }
                else if ( current_rate === this.previous_rate ) {
                    // Main.Util.spawnCommandLine("notify-send -i dialog-information 'Currency Watcher: rate is the same'");
                }
                else {
                    // Main.Util.spawnCommandLine("notify-send -i dialog-information 'Currency Watcher: rate is ---------" + current_rate + "----------'");
                }

                // update UI only if direction changed:
                // if you remove the (current_up_down != '') condition, you will see '->' arrow in case of no rate change.
                if ( this.previous_rate !== 0.0 && current_up_down !== this.previous_up_down ) {
                    // Main.Util.spawnCommandLine("notify-send -i dialog-information 'Currency Watcher: rate is " + current_up_down + "!!!!!'");
                    this.set_applet_icon_path(AppletDirectory + '/icons/arrow' + current_up_down + '.png');
                    // set previous direction:
                    this.previous_up_down = current_up_down;
                    if ( this.previous_up_down !== '' ) {
                      this.configs.set_string('previous-up-down', this.previous_up_down);
                    }
                }

                // Main.Util.spawnCommandLine("notify-send -i dialog-information 'Currency Watcher: rate is ---------" + current_rate + " --- " + this.previous_rate + "----------'");

                // update UI only if rate changed:
                if ( current_rate !== this.previous_rate ) {
                    // Main.Util.spawnCommandLine("notify-send -i dialog-information '!!!!!!!!! " + current_rate + " --- " + this.previous_rate + "----------'");
                    // set previous rate:
                    this.previous_rate = current_rate;
                    this.configs.set_double('previous-rate', this.previous_rate);
                    this.set_applet_label(current_rate.toFixed(4));
                }
            }
        });
        Mainloop.timeout_add_seconds(this.refresh_interval, Lang.bind(this, function() {
            this.refreshCurrency();
        }));
    },

    notifyMsg: function(rate){
        Util.spawnCommandLine("notify-send -i dialog-information 'Currency Watcher: " + rate + "'" );
    }
};

function main(metadata, orientation) {
    let myApplet = new MyApplet(orientation);
    return myApplet;
}

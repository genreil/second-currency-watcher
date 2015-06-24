Currency Watcher Applet
=======================

Applet shows current exchange rate for given currencies.

Currently, given fromCurrency and toCurrency are set in applet.js file.

One can change the refresh frequency on the following line:

Mainloop.timeout_add_seconds(2, Lang.bind(this, function()...

=======================
From author
=======================

In order to create additional watchers on the panel clone this folder and replace all mentioning of "second-currency-watcher" with "third-currency-watcher" (including in file and folder names), and run install.sh script.


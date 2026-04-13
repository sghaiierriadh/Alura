<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>L'expérience de Sarah chez Route 66 - Club Privilèges</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">
    <style>
        /* Reset & Base */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
        /* Couleurs de fond adoucies */
        body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #ebeaf0; }

        /* Typography */
        .font-poppins { font-family: 'Poppins', 'Arial', sans-serif; }
        
        /* Colors */
        .text-purple { color: #493e97; }
        .text-green { color: #10b981; }
        .text-gold { color: #d4af37; }
        
        /* Components */
        .header-title {
            font-size: 26px;
            font-weight: 800;
            color: #2d2c38; /* Remplacement du noir pur */
            line-height: 1.2;
            margin: 0;
            text-transform: uppercase;
        }

        .story-box {
            background-color: #fcfbfa; /* Blanc cassé/perle au lieu de blanc pur */
            border-radius: 16px;
            padding: 25px;
            box-shadow: 0 4px 15px rgba(45, 44, 56, 0.05);
            margin-bottom: 20px;
            border-left: 4px solid #493e97;
            text-align: left;
        }

        .hero-overlay {
            background: linear-gradient(0deg, rgba(45, 44, 56, 0.95) 0%, rgba(45, 44, 56, 0.5) 60%, rgba(0,0,0,0) 100%);
        }

        /* Timeline Wow Card */
        .expense-card {
            background-color: #fcfbfa; /* Blanc perle */
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(73, 62, 151, 0.08);
            border-top: 6px dashed #FDCE00;
            position: relative;
            overflow: hidden;
        }
        
        .expense-header {
            border-bottom: 1px solid #eaeaea;
            padding-bottom: 15px;
            margin-bottom: 15px;
        }

        .partner-logo {
            width: 50px;
            height: 50px;
            border-radius: 10px;
            border: 1px solid #eaeaea;
            object-fit: contain;
            background-color: #fcfbfa;
        }

        .price-line {
            font-size: 14px;
            color: #5d5d66;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
        }

        .price-strike {
            text-decoration: line-through;
            color: #8c8c96;
        }

        .price-paid {
            font-weight: 700;
            color: #2d2c38;
            font-size: 16px;
        }

        .save-badge {
            background: #e8f5e9;
            color: #10b981;
            font-weight: 800;
            font-size: 16px;
            padding: 10px 15px;
            border-radius: 8px;
            display: inline-block;
            margin-top: 5px;
            width: 100%;
            box-sizing: border-box;
            text-align: center;
        }

        /* Boutons */
        .cta-primary {
            display: inline-block;
            padding: 15px 35px;
            background: linear-gradient(135deg, #FDCE00 0%, #f39c12 100%);
            color: #2d2c38 !important;
            border-radius: 50px;
            font-weight: 800;
            text-decoration: none;
            font-size: 15px;
            box-shadow: 0 6px 20px rgba(253, 206, 0, 0.3);
            text-transform: uppercase;
            width: 85%;
            max-width: 300px;
            margin-bottom: 15px;
        }

        .cta-secondary {
            display: inline-block;
            padding: 14px 35px;
            background-color: #2d2c38; /* Remplacement du noir pur */
            color: #fcfbfa !important;
            border-radius: 50px;
            font-weight: 700;
            text-decoration: none;
            font-size: 14px;
            box-shadow: 0 6px 20px rgba(45, 44, 56, 0.2);
            width: 85%;
            max-width: 300px;
        }

        /* Responsive 4 pouces */
        @media screen and (max-width: 480px) {
            .header-title { font-size: 22px !important; }
            .story-box p { font-size: 14px !important; }
            .mobile-image { height: 320px !important; } 
            
            .expense-card { padding: 20px 15px !important; }
            .partner-logo { width: 45px !important; height: 45px !important; }
            
            .mobile-stack-hero { display: block !important; width: 100% !important; text-align: center !important; padding-left: 0 !important; padding-bottom: 10px !important; }
            .mobile-center-img { margin: 0 auto !important; }
            .mobile-stack-offer { display: block !important; width: 100% !important; text-align: center !important; padding-right: 0 !important; padding-bottom: 15px !important; }
            .mobile-stack-offer:last-child { padding-bottom: 0 !important; }
        }

        /* Dark Mode Support Adouci */
        @media (prefers-color-scheme: dark) {
            body { background-color: #1e1d24 !important; }
            h1, h2, h3, p, td, span { color: #fcfbfa !important; }
            .story-box, .expense-card { background-color: #282733 !important; border-color: #3f3e4d !important; }
            .expense-header { border-bottom-color: #3f3e4d !important; }
            .price-line { color: #b5b5c2 !important; }
            .price-paid { color: #fcfbfa !important; }
            .save-badge { background: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important; }
            .text-purple { color: #a594f9 !important; }
            .cta-primary { color: #2d2c38 !important; }
            .cta-secondary { background-color: #3f3e4d !important; color: #fcfbfa !important; }
        }
    </style></head><body style="margin: 0; padding: 0; background-color: #ebeaf0;">
    
    <!-- Pre-header -->
    <div style="display: none; max-height: 0; overflow: hidden;">
        🍔 Découvrez comment Sarah a remboursé un mois d'abonnement en un seul dîner en famille chez Route 66 !
    </div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="font-poppins">
        
        <!-- HEADER -->
        <tr>
            <td align="center" style="padding: 25px 0 15px 0;">
                <a href="https://clubprivileges.app">
                    <img src="https://i.imgur.com/wNtQ0bn.png" width="140" height="140" alt="Club Privilèges" style="border-radius: 50%; box-shadow: 0 4px 10px rgba(45,44,56,0.1);">
                </a>
            </td>
        </tr>

        <!-- CONTAINER -->
        <tr>
            <td align="center" style="padding: 0 10px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
                    
                    <!-- TITRE -->
                    <tr>
                        <td align="center" style="padding-bottom: 20px;">
                            <div style="background-color: #e0dced; color: #493e97; padding: 6px 15px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; margin-bottom: 15px; letter-spacing: 1px; text-transform: uppercase;">Testé pour vous</div>
                            <h1 class="header-title">Le dîner très <span class="text-purple">rentable</span> de Sarah 🍔</h1>
                        </td>
                    </tr>

                    <!-- HERO: ROUTE 66 (Mise en avant du partenaire) -->
                    <tr>
                        <td style="padding-bottom: 25px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-radius: 16px; overflow: hidden; background-color: #383842;">
                                <tr>
                                    <td class="mobile-image" background="https://i.imgur.com/mAqygv7.jpeg" bgcolor="#383842" width="100%" height="320" valign="bottom" style="background: url('https://i.imgur.com/mAqygv7.jpeg') center center / cover no-repeat #383842;">
                                        <!--[if gte mso 9]>
                                        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:320px;">
                                            <v:fill type="tile" src="https://i.imgur.com/mAqygv7.jpeg" color="#383842" />
                                            <v:textbox inset="0,0,0,0">
                                        <![endif]--><div>
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                <tr>
                                                    <td class="hero-overlay" style="padding: 25px;">
                                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                            <tr>
                                                                <td width="70" class="mobile-stack-hero">
                                                                    <img src="https://clubprivileges.app/uploads/partners/logos/99725307-1719217804.jpg" width="70" height="70" alt="Logo Route 66" class="mobile-center-img" style="border-radius: 12px; border: 2px solid #fcfbfa; background: #fcfbfa; object-fit: contain;">
                                                                </td>
                                                                <td class="mobile-stack-hero" style="padding-left: 15px;">
                                                                    <h2 style="margin: 0; color: #fcfbfa; font-size: 24px; font-weight: 800; text-shadow: 0 2px 4px rgba(45,44,56,0.6);">ROUTE 66</h2>
                                                                    <p style="margin: 5px 0 0; color: #FDCE00; font-weight: 600; font-size: 15px;">
                                                                        🇺🇸 L'authentique Diner Américain
                                                                    </p>
                                                                </td>
                                                            </tr>
                                                            <tr>
                                                                <td colspan="2" style="padding-top: 20px;">
                                                                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background: rgba(252, 251, 250, 0.95); border-radius: 12px; padding: 15px;">
                                                                        <tr>
                                                                            <td valign="middle" class="mobile-stack-offer">
                                                                                <div style="font-size: 26px; color: #E3001B; font-weight: 800; line-height: 1;">-10% <span style="font-size: 14px; font-weight: 500; color: #5d5d66; display: inline-block; vertical-align: middle; margin-left: 5px;">sur la facture</span></div>
                                                                            </td>
                                                                            <td align="right" valign="middle" class="mobile-stack-offer">
                                                                                <a href="https://clubprivileges.app/campaign/landing/route66" style="background: #2d2c38; color: #fcfbfa; text-decoration: none; padding: 10px 20px; border-radius: 50px; font-size: 13px; font-weight: 700; white-space: nowrap; display: inline-block;">Découvrir &rarr;</a>
                                                                            </td>
                                                                        </tr>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                        </div>
                                        <!--[if gte mso 9]>
                                            </v:textbox>
                                        </v:rect>
                                        <![endif]--></td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- L'HISTOIRE DE SARAH -->
                    <tr>
                        <td style="padding-bottom: 10px;">
                            <div class="story-box">
                                <p style="margin: 0; color: #4d4d56; font-size: 15px; line-height: 1.6;">
                                    Hier soir, Sarah a voulu faire plaisir à sa famille. Elle a emmené son mari et leurs deux enfants partager de copieux burgers, <strong>de généreuses pizzas et des boissons rafraîchissantes</strong> chez <strong>Route 66</strong>. 
                                    <br><br>
                                    Un super moment en famille... qui s'est avéré très économique au moment de l'addition grâce à son réflexe de sortir l'application ! 👇
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- LE TICKET DE CAISSE (LA PREUVE) -->
                    <tr>
                        <td style="padding-bottom: 20px;">
                            <div class="expense-card">
                                
                                <div style="text-align: center; margin-bottom: 20px;">
                                    <h3 style="margin: 0; color: #2d2c38; font-size: 18px; font-weight: 700;">🧾 L'addition de Sarah</h3>
                                </div>

                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="expense-header">
                                    <tr>
                                        <td width="60" valign="middle">
                                            <img src="https://clubprivileges.app/uploads/partners/logos/99725307-1719217804.jpg" alt="Route 66" class="partner-logo">
                                        </td>
                                        <td valign="middle">
                                            <h3 style="margin: 0 0 2px; font-size: 16px; color: #2d2c38;">Route 66</h3>
                                            <span style="font-size: 12px; color: #5d5d66; background: #eaeaea; padding: 2px 8px; border-radius: 4px;">Dîner Famille (4 pers.)</span>
                                        </td>
                                    </tr>
                                </table>
                                
                                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td width="50%" valign="middle">
                                            <div class="price-line">Sans l'appli : <span class="price-strike">89,00 DT</span></div>
                                            <div class="price-line" style="margin-bottom: 0;">Avec l'appli : <span class="price-paid">80,10 DT</span></div>
                                        </td>
                                        <td width="50%" valign="middle" align="right">
                                            <div class="save-badge">💰 Épargné : 8,9 DT</div>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>

                    <!-- L'EFFET WOW (LE CHIFFRE QUI FAIT REFLECHIR) -->
                    <tr>
                        <td style="padding-bottom: 30px;">
                            <div style="background-color: #493e97; border-radius: 12px; padding: 30px 20px; text-align: center; border: 2px solid #3d347c; box-shadow: 0 8px 20px rgba(73, 62, 151, 0.2);">
                                <div style="font-size: 40px; margin: 0 auto 15px auto; text-align: center; display: block; width: 100%; line-height: 1;">🤯</div>
                                <h3 style="margin: 0 0 15px; color: #fcfbfa; font-size: 20px; font-weight: 800;">L'abonnement rentabilisé !</h3>
                                <p style="margin: 0 0 20px; color: #e0d4fc; font-size: 15px; line-height: 1.6; font-weight: 500;">
                                    En un seul repas en famille, Sarah a économisé l'équivalent d'<strong>un mois entier d'abonnement</strong>.<br><br>
                                    En effet, l'application ne lui coûte que <span style="background-color: #FDCE00; color: #2d2c38; padding: 6px 12px; border-radius: 8px; font-weight: 800; font-size: 18px; display: inline-block; margin-top: 10px; box-shadow: 0 4px 10px rgba(253, 206, 0, 0.3);">0,300 DT / jour</span> directement sur son solde mobile.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- BOUTONS D'ACTION (REORGANISES) -->
                    <tr>
                        <td align="center" style="padding-bottom: 40px;">
                            <!-- Bouton Téléchargement Appli EN PREMIER -->
                            <a href="https://clubprivileges.short.gy/RSzSN6" class="cta-primary">Télécharger l'Appli</a><br>
                            <!-- Bouton Route 66 EN DESSOUS -->
                            <a href="https://clubprivileges.app/offre/route-66" class="cta-secondary">Découvrir Route 66</a>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td align="center" style="padding-top: 10px; padding-bottom: 40px; border-top: 1px solid #dcdce2;">
                            
                            <!-- SOCIAL ICONS -->
                            <div style="margin-bottom: 20px;">
                                <a href="https://www.instagram.com/clubprivileges.app/" style="text-decoration: none; margin: 0 10px;"><img src="https://i.imgur.com/hOaFQHn.png" width="25" alt="Instagram" style="display: inline-block;"></a>
                                <a href="https://www.facebook.com/ClubPrivileges" style="text-decoration: none; margin: 0 10px;"><img src="https://i.imgur.com/44xpTKF.png" width="25" alt="Facebook" style="display: inline-block;"></a>
                                <a href="https://www.youtube.com/@clubprivileges2728" style="text-decoration: none; margin: 0 10px;"><img src="https://i.imgur.com/qdePf4G.png" width="25" alt="YouTube" style="display: inline-block;"></a>
                            </div>

                            <p style="color: #8c8c96; font-size: 12px; line-height: 1.5; margin: 0;">
                                <strong>Club Privilèges</strong><br>
                                Menzah, Tunis<br><br>
                                <a href="https://clubprivileges.app" style="color: #493e97; text-decoration: none;">Visiter le site</a> • 
                                <a href="{{unsubscribe_url}}" style="color: #8c8c96; text-decoration: underline;">Se désinscrire</a>
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
<iframe 
        src="http://localhost:3000/widget?agentId=4fa93a7d-cd06-4780-9036-5c30d32e9672" 
        style="position: fixed; bottom: 20px; right: 20px; width: 400px; height: 600px; border: none; z-index: 9999;"
        allow="clipboard-write"
    ></iframe>

</body></html> 

